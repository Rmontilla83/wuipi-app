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

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

      const [bw, lat, retx, cong, tams] = await Promise.all([
        getSubscriberBandwidth(ip, 5, 1),
        getSubscriberLatency(ip, 5, 1),
        getSubscriberRetransmission(ip, 5, 1),
        getSubscriberCongestion(ip, 5, 1),
        getSubscriberTrafficAtMaxSpeed(ip, 5, 1),
      ]);

      const dlKbps = lastValid(bw?.dataDownlink);
      const ulKbps = lastValid(bw?.dataUplink);
      const latencyMs = lastValid(lat?.dataDownlink);
      const retxPct = lastValid(retx?.dataDownlink);
      const congPct = lastValid(cong?.dataDownlink);
      const tamsPct = lastValid(tams?.dataDownlink);

      // Data presence = server reachability for this client
      const hasData = [dlKbps, latencyMs, retxPct].some(v => v !== null);

      if (!hasData) {
        return {
          name: productName,
          plan_name: productName,
          plan_mbps: planMbps,
          state: svc.state,
          available: false,
          reason: svc.state === "suspended"
            ? "Servicio suspendido — sin mediciones"
            : "Sin mediciones recientes — probá actualizar en unos minutos",
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

      // 24h history from BQN — bandwidth only, simplified
      const bw24h = await getSubscriberBandwidth(ip, 60, 24);
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
      };
    }));

    return apiSuccess({ services: results });
  } catch (error) {
    return apiServerError(error);
  }
}
