// ============================================
// Bequant BQN — Read-only HTTP client
// ============================================
// READ-ONLY: all write methods removed. Policies/subs are managed by the
// network engineer directly on the BQN appliance.
//
// Resilience layers:
//   1. undici.Pool — keep-alive TCP/TLS connection pool (max 4 conns)
//   2. Scoped TLS bypass for self-signed cert (only on this Pool, NOT global)
//   3. Global semaphore — max 10 concurrent requests to BQN
//   4. Singleflight — dedupes identical in-flight requests
//   5. Circuit breaker — opens on 5 failures in 30s for 60s
//   6. 15s per-request timeout
//   7. Redacted logging (no Authorization header ever logged)
//
// Host allowlist enforced by bequantConfigSchema (see validations/schemas.ts).
// ============================================

import { Pool, fetch as undiciFetch } from "undici";
import { isAllowedBequantHost } from "@/lib/validations/schemas";
import type {
  BequantListResponse,
  BequantSubscriber,
  BequantSubscriberGroup,
  BequantRatePolicy,
  BequantTimeSeries,
  BequantDpiSeries,
  BequantTestResult,
} from "@/types/bequant";

// ──────────────────────────────────────────────
// Config resolution (DB → env fallback)
// ──────────────────────────────────────────────

interface ResolvedConfig {
  host: string;
  port: number;
  authHeader: string;
  dispatcher: Pool;
  origin: string;
}

let cachedConfig: { cfg: ResolvedConfig; expiresAt: number } | null = null;
const CONFIG_TTL_MS = 60_000;

function buildDispatcher(host: string, port: number): Pool {
  return new Pool(`https://${host}:${port}`, {
    connect: { rejectUnauthorized: false }, // scoped to this Pool only
    connections: 4,
    pipelining: 1,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 600_000,
    headersTimeout: 15_000,
    bodyTimeout: 15_000,
  });
}

async function resolveConfig(): Promise<ResolvedConfig | null> {
  if (cachedConfig && Date.now() < cachedConfig.expiresAt) return cachedConfig.cfg;

  // 1. Try DB config (enabled row)
  try {
    const { getActiveBequantConfig } = await import("@/lib/dal/bequant");
    const { decryptPassword } = await import("@/lib/utils/crypto");
    const row = await getActiveBequantConfig();
    if (row && isAllowedBequantHost(row.host)) {
      const password = decryptPassword(row.encrypted_password);
      const cfg: ResolvedConfig = {
        host: row.host,
        port: row.port,
        authHeader: "Basic " + Buffer.from(`${row.username}:${password}`).toString("base64"),
        dispatcher: buildDispatcher(row.host, row.port),
        origin: `https://${row.host}:${row.port}`,
      };
      cachedConfig = { cfg, expiresAt: Date.now() + CONFIG_TTL_MS };
      return cfg;
    }
  } catch {
    // DAL unavailable during build — fall through
  }

  // 2. Env fallback
  const url = process.env.BEQUANT_URL;
  const user = process.env.BEQUANT_USER;
  const pass = process.env.BEQUANT_PASSWORD;
  if (!url || !user || !pass) return null;

  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 7343;
  if (!isAllowedBequantHost(host)) {
    console.error("[Bequant] host blocked by allowlist:", host);
    return null;
  }

  const cfg: ResolvedConfig = {
    host,
    port,
    authHeader: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
    dispatcher: buildDispatcher(host, port),
    origin: `https://${host}:${port}`,
  };
  cachedConfig = { cfg, expiresAt: Date.now() + CONFIG_TTL_MS };
  return cfg;
}

export function invalidateConfigCache(): void {
  if (cachedConfig) cachedConfig.cfg.dispatcher.close().catch(() => {});
  cachedConfig = null;
}

// ──────────────────────────────────────────────
// Global semaphore (max 10 concurrent BQN requests)
// ──────────────────────────────────────────────

const MAX_CONCURRENT = 10;
let inFlight = 0;
const semQueue: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) { inFlight++; return; }
  await new Promise<void>(resolve => semQueue.push(resolve));
  inFlight++;
}
function release(): void {
  inFlight--;
  const next = semQueue.shift();
  if (next) next();
}

// ──────────────────────────────────────────────
// Circuit breaker
// ──────────────────────────────────────────────

// Tuned for an appliance with ocasional 500s under load:
// we only break when failures dominate, not on single blips.
const FAIL_THRESHOLD = 10;
const FAIL_WINDOW_MS = 60_000;
const OPEN_DURATION_MS = 30_000;

let failTimes: number[] = [];
let openedAt = 0;

function isCircuitOpen(): boolean {
  if (openedAt === 0) return false;
  if (Date.now() - openedAt < OPEN_DURATION_MS) return true;
  openedAt = 0;
  failTimes = [];
  return false;
}
function recordFailure(): void {
  const now = Date.now();
  failTimes = failTimes.filter(t => now - t < FAIL_WINDOW_MS);
  failTimes.push(now);
  if (failTimes.length >= FAIL_THRESHOLD) openedAt = now;
}
function recordSuccess(): void {
  if (failTimes.length > 0) failTimes = [];
}

export function getCircuitState(): { open: boolean; failures: number; opensFor: number } {
  const open = isCircuitOpen();
  return {
    open,
    failures: failTimes.length,
    opensFor: open ? Math.max(0, OPEN_DURATION_MS - (Date.now() - openedAt)) : 0,
  };
}

// ──────────────────────────────────────────────
// Singleflight — dedupe in-flight identical requests
// ──────────────────────────────────────────────

const inFlightMap = new Map<string, Promise<unknown>>();

function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlightMap.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inFlightMap.delete(key));
  inFlightMap.set(key, p);
  return p;
}

// ──────────────────────────────────────────────
// Core GET — the ONLY way to call BQN. No write methods exist.
// ──────────────────────────────────────────────

async function bqnGet<T>(path: string): Promise<T | null> {
  if (isCircuitOpen()) {
    console.warn("[Bequant] circuit open — skipping", path);
    return null;
  }

  const cfg = await resolveConfig();
  if (!cfg) return null;

  const cacheKey = `${cfg.origin}${path}`;
  return singleflight(cacheKey, async () => {
    await acquire();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await undiciFetch(`${cfg.origin}/api/v1${path}`, {
        method: "GET",
        headers: {
          Authorization: cfg.authHeader,
          Accept: "application/json",
        },
        dispatcher: cfg.dispatcher,
        signal: controller.signal,
      });
      if (!res.ok) {
        recordFailure();
        console.error(`[Bequant] HTTP ${res.status} on ${path}`);
        return null;
      }
      const text = await res.text();
      recordSuccess();
      return text ? (JSON.parse(text) as T) : null;
    } catch (err) {
      recordFailure();
      const msg = (err as Error).message?.replace(/Basic\s+[\w+/=]+/gi, "Basic [REDACTED]") || "unknown";
      console.error(`[Bequant] ${path}: ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
      release();
    }
  });
}

// ──────────────────────────────────────────────
// Test connection — accepts arbitrary creds (not cached)
// ──────────────────────────────────────────────

export async function testConnection(
  host: string,
  port: number,
  username: string,
  password: string
): Promise<BequantTestResult> {
  if (!isAllowedBequantHost(host)) {
    return { success: false, message: `Host ${host} no permitido por allowlist` };
  }
  const dispatcher = buildDispatcher(host, port);
  const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  const origin = `https://${host}:${port}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const [polRes, subRes] = await Promise.all([
      undiciFetch(`${origin}/api/v1/policies/rate`, {
        headers: { Authorization: auth },
        dispatcher,
        signal: controller.signal,
      }),
      undiciFetch(`${origin}/api/v1/subscribers`, {
        headers: { Authorization: auth },
        dispatcher,
        signal: controller.signal,
      }),
    ]);
    if (polRes.status === 401 || subRes.status === 401) {
      return { success: false, message: "Credenciales inválidas" };
    }
    if (!polRes.ok) return { success: false, message: `HTTP ${polRes.status} en /policies/rate` };
    if (!subRes.ok) return { success: false, message: `HTTP ${subRes.status} en /subscribers` };

    const [polJson, subJson] = await Promise.all([polRes.json(), subRes.json()]);
    const pol = polJson as { items?: unknown[] };
    const sub = subJson as { items?: unknown[] };
    const polCount = pol.items?.length ?? 0;
    const subCount = sub.items?.length ?? 0;
    return {
      success: true,
      message: `Conectado: ${subCount} suscriptores, ${polCount} políticas`,
      subscribers: subCount,
      policies: polCount,
    };
  } catch (err) {
    const e = err as Error;
    const msg = e.name === "AbortError" ? "Timeout (10s)" : e.message;
    return { success: false, message: `Error: ${msg}` };
  } finally {
    clearTimeout(timer);
    dispatcher.close().catch(() => {});
  }
}

// ──────────────────────────────────────────────
// Public read API
// ──────────────────────────────────────────────

export async function listSubscribers(): Promise<BequantSubscriber[]> {
  const data = await bqnGet<BequantListResponse<BequantSubscriber>>("/subscribers");
  return data?.items ?? [];
}

export async function getSubscriber(ip: string): Promise<BequantSubscriber | null> {
  return bqnGet<BequantSubscriber>(`/subscribers/${encodeURIComponent(ip)}`);
}

export async function listSubscriberGroups(): Promise<BequantSubscriberGroup[]> {
  const data = await bqnGet<BequantListResponse<BequantSubscriberGroup>>("/subscriberGroups");
  return data?.items ?? [];
}

export async function listRatePolicies(): Promise<BequantRatePolicy[]> {
  const data = await bqnGet<BequantListResponse<BequantRatePolicy>>("/policies/rate");
  return data?.items ?? [];
}

// --- Time-series metrics ---

type Interval = 5 | 15 | 60;
type Period = 1 | 6 | 24;

function tsQuery(interval: Interval, period: Period) {
  return `?interval=${interval}&period=${period}`;
}

export async function getSubscriberBandwidth(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/bandwidth${tsQuery(interval, period)}`);
}
export async function getSubscriberLatency(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/latency${tsQuery(interval, period)}`);
}
export async function getSubscriberCongestion(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/congestion${tsQuery(interval, period)}`);
}
export async function getSubscriberRetransmission(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/retransmission${tsQuery(interval, period)}`);
}
export async function getSubscriberFlows(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<(BequantTimeSeries & { flowsCreated?: number[]; flowsActive?: number[] }) | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/flows${tsQuery(interval, period)}`);
}
export async function getSubscriberVolume(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/volume${tsQuery(interval, period)}`);
}
export async function getSubscriberTrafficAtMaxSpeed(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/trafficAtMaxSpeed${tsQuery(interval, period)}`);
}
export async function getSubscriberDpiDownlink(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantDpiSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/dpiDownlink${tsQuery(interval, period)}`);
}
export async function getSubscriberDpiUplink(
  ip: string, interval: Interval = 5, period: Period = 1
): Promise<BequantDpiSeries | null> {
  return bqnGet(`/subscribers/${encodeURIComponent(ip)}/dpiUplink${tsQuery(interval, period)}`);
}

// --- Node metrics ---

export async function getNodeBandwidth(
  interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/node/bandwidth${tsQuery(interval, period)}`);
}
export async function getNodeLatency(
  interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/node/latency${tsQuery(interval, period)}`);
}
export async function getNodeCongestion(
  interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/node/congestion${tsQuery(interval, period)}`);
}
export async function getNodeRetransmission(
  interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/node/retransmission${tsQuery(interval, period)}`);
}
export async function getNodeFlows(
  interval: Interval = 5, period: Period = 1
): Promise<(BequantTimeSeries & { flowsCreated?: number[]; flowsActive?: number[] }) | null> {
  return bqnGet(`/node/flows${tsQuery(interval, period)}`);
}
export async function getNodeVolume(
  interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/node/volume${tsQuery(interval, period)}`);
}
export async function getNodeTrafficAtMaxSpeed(
  interval: Interval = 5, period: Period = 1
): Promise<BequantTimeSeries | null> {
  return bqnGet(`/node/trafficAtMaxSpeed${tsQuery(interval, period)}`);
}
export async function getNodeDpiDownlink(
  interval: Interval = 60, period: Period = 1
): Promise<BequantDpiSeries | null> {
  return bqnGet(`/node/dpiDownlink${tsQuery(interval, period)}`);
}
export async function getNodeDpiUplink(
  interval: Interval = 60, period: Period = 1
): Promise<BequantDpiSeries | null> {
  return bqnGet(`/node/dpiUplink${tsQuery(interval, period)}`);
}

// ──────────────────────────────────────────────
// Helpers — useful for UIs
// ──────────────────────────────────────────────

/** Return the most recent non-(-1) value from a series, or null. */
export function lastValid(values?: number[]): number | null {
  if (!values) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== -1 && !Number.isNaN(values[i])) return values[i];
  }
  return null;
}

/** Top N DPI categories summed across the period. */
export function topDpiCategories(
  series: BequantDpiSeries | null,
  n = 10
): Array<{ name: string; bytes: number }> {
  if (!series?.categories) return [];
  return series.categories
    .map(c => ({
      name: c.name,
      bytes: (c.usage || []).filter(v => v !== -1).reduce((a, b) => a + b, 0),
    }))
    .filter(c => c.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, n);
}
