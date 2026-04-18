// ============================================
// Portal API — Mi Conexión (client-friendly Bequant data)
// ============================================
// Returns simplified, privacy-safe metrics for the authenticated portal user:
// - No DPI / app usage
// - No raw technical jargon in the payload (client layer translates to UI)
// - Speed in Mbps (not kbps)
// - Latency in ms
// - Quality score 0-100 (translated on UI to excellent/good/fair/poor)
// ============================================

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { getPortalCaller, getCallerProfile } from "@/lib/auth/check-permission";
import { searchRead } from "@/lib/integrations/odoo";
import {
  getSubscriberBandwidth, getSubscriberLatency,
  getSubscriberRetransmission, getSubscriberCongestion,
  getSubscriberTrafficAtMaxSpeed,
  lastValid,
} from "@/lib/integrations/bequant";
import {
  getSubscriberSnapshot, upsertSubscriberSnapshots,
} from "@/lib/dal/bequant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface OdooSvc {
  id: number;
  name: string;
  ip_cpe: string;
  ipv4: string | [number, string];
  product_id: [number, string] | false;
  state: string;
}

type ScoreLevel = "excellent" | "good" | "fair" | "poor";

function scoreLevel(score: number): ScoreLevel {
  if (score >= 85) return "excellent";
  if (score >= 65) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

// Extract Mbps number from product name like "[FIBRA-100] Plan 100 Mbps"
function planSpeedFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*(?:mbps|mb)/i);
  return m ? parseInt(m[1], 10) : null;
}

const ADMIN_ROLES = ["admin", "super_admin", "infraestructura", "gerente", "soporte"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paramPartnerId = searchParams.get("partnerId");

    let partnerId: number;
    // Priority 1: portal client viewing their own
    const portalCaller = await getPortalCaller();
    if (portalCaller) {
      // If admin accidentally hits this endpoint from the portal context with partnerId, ignore it
      partnerId = portalCaller.odoo_partner_id;
    } else if (paramPartnerId) {
      // Priority 2: admin/staff querying on behalf of a client (preview mode)
      const adminCaller = await getCallerProfile();
      if (!adminCaller || !ADMIN_ROLES.includes(adminCaller.role)) {
        return apiError("No autenticado", 401);
      }
      const pid = parseInt(paramPartnerId, 10);
      if (Number.isNaN(pid)) return apiError("partnerId inválido", 400);
      partnerId = pid;
    } else {
      return apiError("No autenticado", 401);
    }

    const services = await searchRead("mikrotik.service", [
      ["partner_id", "=", partnerId],
      ["state", "in", ["progress", "suspended"]],
    ], {
      fields: ["id", "name", "ip_cpe", "ipv4", "product_id", "state"],
      limit: 10,
    }) as OdooSvc[];

    if (services.length === 0) {
      return apiSuccess({ services: [], message: "Sin servicios activos" });
    }

    const results = await Promise.all(services.map(async (svc) => {
      const ip = svc.ip_cpe || (Array.isArray(svc.ipv4) ? svc.ipv4[1] : svc.ipv4);
      const productName = svc.product_id ? svc.product_id[1] : "Servicio";
      const planMbps = planSpeedFromName(productName);

      if (!ip || typeof ip !== "string") {
        return {
          name: productName,
          plan_name: productName,
          plan_mbps: planMbps,
          state: svc.state,
          available: false,
          reason: "Servicio aún sin IP asignada",
        };
      }

      // Period 6h (instead of 1h) gives 72 samples at 5min interval —
      // much less likely to hit "all -1" when the client had no recent traffic.
      // history_24h moved into the same Promise.all to avoid sequential 12s+retry penalty.
      const [bw, lat, retx, cong, tams, bw24h] = await Promise.all([
        getSubscriberBandwidth(ip, 5, 6),
        getSubscriberLatency(ip, 5, 6),
        getSubscriberRetransmission(ip, 5, 6),
        getSubscriberCongestion(ip, 5, 6),
        getSubscriberTrafficAtMaxSpeed(ip, 5, 6),
        getSubscriberBandwidth(ip, 60, 24),
      ]);

      const dlKbps = lastValid(bw?.dataDownlink);
      const ulKbps = lastValid(bw?.dataUplink);
      const latencyMs = lastValid(lat?.dataDownlink);
      const retxPct = lastValid(retx?.dataDownlink);
      const congPct = lastValid(cong?.dataDownlink);
      const tamsPct = lastValid(tams?.dataDownlink);

      // Distinguish two "no data" cases:
      //  (a) BQN didn't respond at all → all series are null/undefined
      //  (b) BQN responded but every sample is -1 → client had no traffic in the window
      const bqnResponded = bw != null || lat != null || retx != null;
      const hasData = [dlKbps, latencyMs, retxPct].some(v => v !== null);

      // If BQN didn't respond, try the stored snapshot before giving up.
      // This is the core fix for "portal sometimes shows nothing" — snapshot
      // is populated by a daily cron + write-through from every successful live call.
      if (!hasData && !bqnResponded) {
        const snap = await getSubscriberSnapshot(ip);
        if (snap && snap.download_kbps != null) {
          const snapDlMbps = (snap.download_kbps ?? 0) / 1000;
          const snapUlMbps = (snap.upload_kbps ?? 0) / 1000;
          const snapIssues: string[] = [];
          if (planMbps && snapDlMbps < planMbps * 0.5) snapIssues.push("slow_speed");
          if ((snap.latency_ms ?? 0) > 100) snapIssues.push("high_latency");
          if ((snap.retransmission_pct ?? 0) > 5) snapIssues.push("unstable");
          return {
            name: svc.name || productName,
            plan_name: productName.replace(/^\[.*?\]\s*/, ""),
            plan_mbps: planMbps,
            state: svc.state,
            available: true,
            score: snap.score ?? 70,
            score_level: scoreLevel(snap.score ?? 70),
            current: {
              download_mbps: Math.round(snapDlMbps * 10) / 10,
              upload_mbps: Math.round(snapUlMbps * 10) / 10,
              latency_ms: snap.latency_ms != null ? Math.round(snap.latency_ms * 10) / 10 : null,
            },
            issues: snapIssues,
            history_24h: [],
            last_updated: snap.taken_at,
            from_snapshot: true,
          };
        }
      }

      if (!hasData) {
        let reason: string;
        if (svc.state === "suspended") {
          reason = "Servicio suspendido — sin mediciones";
        } else if (bqnResponded) {
          reason = "Sin tráfico reciente — tu servicio está operativo";
        } else {
          reason = "Sin mediciones recientes — probá actualizar en unos minutos";
        }
        return {
          name: productName,
          plan_name: productName,
          plan_mbps: planMbps,
          state: svc.state,
          available: false,
          reason,
          no_traffic: bqnResponded && !hasData,
        };
      }

      // Score calculation (0-100) — composite, client-friendly
      const dlMbps = dlKbps ? dlKbps / 1000 : 0;
      const ulMbps = ulKbps ? ulKbps / 1000 : 0;

      // Speed score: % of contracted plan (capped at 100)
      const speedScore = planMbps && planMbps > 0
        ? Math.min(100, (dlMbps / planMbps) * 100)
        : (tamsPct != null ? tamsPct : 70);

      // Latency score
      const lat_ms = latencyMs ?? 50;
      const latencyScore = lat_ms < 25 ? 100
        : lat_ms < 60 ? 80
        : lat_ms < 100 ? 50
        : lat_ms < 200 ? 25
        : 10;

      // Stability score (retx — less = better)
      const rx = retxPct ?? 1;
      const stabilityScore = rx < 1 ? 100 : rx < 3 ? 75 : rx < 5 ? 45 : 20;

      // Congestion score
      const cg = congPct ?? 5;
      const congestionScore = cg < 5 ? 100 : cg < 20 ? 70 : cg < 50 ? 40 : 15;

      const score = Math.round(
        speedScore * 0.40 +
        latencyScore * 0.25 +
        stabilityScore * 0.20 +
        congestionScore * 0.15
      );

      // Detect actionable issues (simple rules)
      const issues: string[] = [];
      if (planMbps && dlMbps < planMbps * 0.5) issues.push("slow_speed");
      if (lat_ms > 100) issues.push("high_latency");
      if (rx > 5) issues.push("unstable");

      // 24h history already fetched in the parallel block above.
      const history: Array<{ time: string; download_mbps: number | null }> = [];
      if (bw24h?.timestamp) {
        for (let i = 0; i < bw24h.timestamp.length; i++) {
          const kbps = bw24h.dataDownlink?.[i];
          history.push({
            time: new Date(bw24h.timestamp[i] * 1000).toLocaleTimeString("es-VE", {
              hour: "2-digit", minute: "2-digit",
            }),
            download_mbps: kbps === -1 || kbps == null ? null : Math.round((kbps / 1000) * 10) / 10,
          });
        }
      }

      // Write-through to snapshot table (fire-and-forget) so next time the
      // BQN hiccups, this client still sees a value instead of "Sin mediciones".
      upsertSubscriberSnapshots([{
        ip,
        download_kbps: dlKbps,
        upload_kbps: ulKbps,
        latency_ms: latencyMs,
        retransmission_pct: retxPct,
        congestion_pct: congPct,
        traffic_at_max_speed: tamsPct,
        score,
        plan_mbps: planMbps,
      }]).catch(err => console.warn("[my-connection] snapshot upsert:", (err as Error).message));

      return {
        name: svc.name || productName,
        plan_name: productName.replace(/^\[.*?\]\s*/, ""),
        plan_mbps: planMbps,
        state: svc.state,
        available: true,
        score,
        score_level: scoreLevel(score),
        current: {
          download_mbps: Math.round(dlMbps * 10) / 10,
          upload_mbps: Math.round(ulMbps * 10) / 10,
          latency_ms: latencyMs != null ? Math.round(latencyMs * 10) / 10 : null,
        },
        issues,
        history_24h: history,
        last_updated: new Date().toISOString(),
        from_snapshot: false,
      };
    }));

    return apiSuccess({ services: results });
  } catch (error) {
    return apiServerError(error);
  }
}
