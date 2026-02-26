// ============================================
// Bequant QoE — Integration
// ============================================
// Bequant API: REST at https://<bqn-ip>:3443/api/v1
// Auth: HTTP Basic over HTTPS
//
// Endpoints:
// - GET /subscribers/{subscriberIp} — subscriber info
// - GET /subscribers/{subscriberIp}/metrics?metrics=bandwidth,latency,retransmissions,flows,dpi&granularity=hour&startDate=...&endDate=...
// ============================================

import type {
  BequantSubscriber,
  BequantMetrics,
  BequantDPI,
  QoEScore,
  QoELevel,
  BequantResponse,
} from "@/types/bequant";

const BEQUANT_URL = process.env.BEQUANT_URL;
const BEQUANT_USER = process.env.BEQUANT_USER;
const BEQUANT_PASSWORD = process.env.BEQUANT_PASSWORD;

function isConfigured(): boolean {
  return !!(BEQUANT_URL && BEQUANT_USER && BEQUANT_PASSWORD);
}

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${BEQUANT_USER}:${BEQUANT_PASSWORD}`).toString("base64");
}

function getBaseUrl(): string {
  return `${BEQUANT_URL}/api/v1`;
}

function getPeriodDates(period: "24h" | "7d" | "30d"): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (period === "24h") start.setHours(start.getHours() - 24);
  else if (period === "7d") start.setDate(start.getDate() - 7);
  else start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

// ============================================
// API Functions
// ============================================

export async function getBequantSubscriber(ip: string): Promise<BequantSubscriber | null> {
  if (!isConfigured()) return null;

  try {
    const res = await fetch(`${getBaseUrl()}/subscribers/${ip}`, {
      headers: { Authorization: getAuthHeader() },
      // Bequant uses self-signed certs in many installations
      // @ts-expect-error Node fetch rejectUnauthorized option
      rejectUnauthorized: false,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("[Bequant] Error fetching subscriber:", err);
    return null;
  }
}

export async function getBequantMetrics(
  ip: string,
  period: "24h" | "7d" | "30d" = "24h"
): Promise<BequantMetrics | null> {
  if (!isConfigured()) return null;

  try {
    const { startDate, endDate } = getPeriodDates(period);
    const granularity = period === "24h" ? "hour" : period === "7d" ? "day" : "day";
    const params = new URLSearchParams({
      metrics: "bandwidth,latency,retransmissions,congestion,trafficAtMaxSpeed,volume",
      granularity,
      startDate,
      endDate,
    });

    const res = await fetch(`${getBaseUrl()}/subscribers/${ip}/metrics?${params}`, {
      headers: { Authorization: getAuthHeader() },
      // @ts-expect-error Node fetch rejectUnauthorized option
      rejectUnauthorized: false,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("[Bequant] Error fetching metrics:", err);
    return null;
  }
}

export async function getBequantDPI(
  ip: string,
  period: "24h" | "7d" | "30d" = "24h"
): Promise<BequantDPI | null> {
  if (!isConfigured()) return null;

  try {
    const { startDate, endDate } = getPeriodDates(period);
    const params = new URLSearchParams({
      metrics: "dpi",
      granularity: period === "24h" ? "hour" : "day",
      startDate,
      endDate,
    });

    const res = await fetch(`${getBaseUrl()}/subscribers/${ip}/metrics?${params}`, {
      headers: { Authorization: getAuthHeader() },
      // @ts-expect-error Node fetch rejectUnauthorized option
      rejectUnauthorized: false,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.dpi || null;
  } catch (err) {
    console.error("[Bequant] Error fetching DPI:", err);
    return null;
  }
}

// ============================================
// QoE Score Calculator
// ============================================

export function calculateQoEScore(
  metrics: BequantMetrics,
  planSpeedDown?: number // Mbps contratados
): QoEScore {
  // Speed vs plan factor (0-100)
  const realSpeedMbps = (metrics.bandwidth?.downlink || 0) / 1_000_000;
  const speedFactor = planSpeedDown && planSpeedDown > 0
    ? Math.min(100, (realSpeedMbps / planSpeedDown) * 100)
    : metrics.trafficAtMaxSpeed || 50;

  // Latency factor (0-100): <20ms=100, 20-50=80, 50-100=60, 100-200=30, >200=10
  const lat = metrics.latency || 0;
  const latencyFactor = lat < 20 ? 100 : lat < 50 ? 80 : lat < 100 ? 60 : lat < 200 ? 30 : 10;

  // Retransmissions factor (0-100): <1%=100, 1-3%=70, 3-5%=40, >5%=10
  const retx = metrics.retransmissions || 0;
  const retxFactor = retx < 1 ? 100 : retx < 3 ? 70 : retx < 5 ? 40 : 10;

  // Congestion factor (0-100): <5%=100, 5-20%=70, 20-50%=40, >50%=10
  const cong = metrics.congestion || 0;
  const congFactor = cong < 5 ? 100 : cong < 20 ? 70 : cong < 50 ? 40 : 10;

  // Weighted score
  const score = Math.round(
    speedFactor * 0.35 +
    latencyFactor * 0.25 +
    retxFactor * 0.20 +
    congFactor * 0.20
  );

  const level: QoELevel = score > 80 ? "excellent" : score > 50 ? "acceptable" : "degraded";

  return {
    score,
    level,
    factors: {
      speedVsPlan: Math.round(speedFactor),
      latency: Math.round(latencyFactor),
      retransmissions: Math.round(retxFactor),
      congestion: Math.round(congFactor),
    },
  };
}

// ============================================
// Combined fetch for API route
// ============================================

export async function getBequantData(
  ip: string,
  period: "24h" | "7d" | "30d" = "24h",
  planSpeedDown?: number
): Promise<BequantResponse> {
  if (!isConfigured()) {
    return { connected: false, message: "Bequant no configurado" };
  }

  const [subscriber, metrics, dpi] = await Promise.all([
    getBequantSubscriber(ip),
    getBequantMetrics(ip, period),
    getBequantDPI(ip, period),
  ]);

  if (!subscriber && !metrics) {
    return { connected: true, message: "Suscriptor no encontrado en Bequant" };
  }

  const qoe = metrics ? calculateQoEScore(metrics, planSpeedDown) : undefined;

  return {
    connected: true,
    subscriber: subscriber || undefined,
    metrics: metrics || undefined,
    dpi: dpi || undefined,
    qoe,
  };
}
