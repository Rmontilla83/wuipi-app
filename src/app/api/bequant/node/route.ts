import {
  getNodeVolume, getNodeLatency, getNodeCongestion, getNodeRetransmission,
  getNodeFlows, getNodeTrafficAtMaxSpeed, getNodeDpiDownlink, getNodeDpiUplink,
  lastValid, topDpiCategories, getCircuitState,
} from "@/lib/integrations/bequant";
import { getLatestSnapshot, getSnapshotsSince, listSyncedGroups } from "@/lib/dal/bequant";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    if (caller.role === "soporte") return apiError("Sin permisos para vista nodo", 403);

    const [volume, latency, congestion, retransmission, flows, tams, dpiDl, dpiUl, latestSnap, trend24h, groups] =
      await Promise.all([
        getNodeVolume(5, 1),
        getNodeLatency(5, 1),
        getNodeCongestion(5, 1),
        getNodeRetransmission(5, 1),
        getNodeFlows(5, 1),
        getNodeTrafficAtMaxSpeed(5, 1),
        getNodeDpiDownlink(60, 1),
        getNodeDpiUplink(60, 1),
        getLatestSnapshot(),
        getSnapshotsSince(new Date(Date.now() - 24 * 3600 * 1000)),
        listSyncedGroups(),
      ]);

    // Live KPIs: fall back to last snapshot when BQN returned nothing
    const liveKpis = {
      volumeDl: lastValid(volume?.dataDownlink),
      volumeUl: lastValid(volume?.dataUplink),
      latencyDl: lastValid(latency?.dataDownlink),
      latencyUl: lastValid(latency?.dataUplink),
      congestion: lastValid(congestion?.dataDownlink),
      retransmissionDl: lastValid(retransmission?.dataDownlink),
      retransmissionUl: lastValid(retransmission?.dataUplink),
      flowsActive: lastValid(flows?.flowsActive),
      flowsCreated: lastValid(flows?.flowsCreated),
      trafficAtMaxSpeed: lastValid(tams?.dataDownlink),
    };

    // Compose final KPIs: live first, then snapshot fallback per-metric.
    // This keeps the UI populated even when the BQN hiccups on individual endpoints.
    const snap = latestSnap;
    const kpis = {
      volumeDl: liveKpis.volumeDl ?? snap?.volume_dl ?? null,
      volumeUl: liveKpis.volumeUl ?? snap?.volume_ul ?? null,
      latencyDl: liveKpis.latencyDl ?? snap?.latency_dl ?? null,
      latencyUl: liveKpis.latencyUl ?? snap?.latency_ul ?? null,
      congestion: liveKpis.congestion ?? snap?.congestion ?? null,
      retransmissionDl: liveKpis.retransmissionDl ?? snap?.retransmission_dl ?? null,
      retransmissionUl: liveKpis.retransmissionUl ?? snap?.retransmission_ul ?? null,
      flowsActive: liveKpis.flowsActive ?? snap?.flows_active ?? null,
      flowsCreated: liveKpis.flowsCreated ?? snap?.flows_created ?? null,
      trafficAtMaxSpeed: liveKpis.trafficAtMaxSpeed ?? snap?.traffic_at_max_speed ?? null,
    };

    // Per-KPI source indicator (live | snapshot | missing) — useful for UI badge
    const source = {
      volumeDl: liveKpis.volumeDl != null ? "live" : snap?.volume_dl != null ? "snapshot" : "missing",
      latencyDl: liveKpis.latencyDl != null ? "live" : snap?.latency_dl != null ? "snapshot" : "missing",
      congestion: liveKpis.congestion != null ? "live" : snap?.congestion != null ? "snapshot" : "missing",
      retransmissionDl: liveKpis.retransmissionDl != null ? "live" : snap?.retransmission_dl != null ? "snapshot" : "missing",
    };

    // Count live vs snapshot to decide UI freshness banner
    const liveCount = [liveKpis.volumeDl, liveKpis.latencyDl, liveKpis.congestion, liveKpis.retransmissionDl]
      .filter(v => v != null).length;

    return apiSuccess({
      live: {
        volume, latency, congestion, retransmission, flows,
        trafficAtMaxSpeed: tams,
      },
      kpis,
      source,
      dataFreshness: {
        liveCount,         // how many KPIs came from live (0-4)
        hasSnapshot: !!snap,
        snapshotAt: snap?.taken_at || null,
      },
      dpi: {
        downlinkTop: topDpiCategories(dpiDl, 10),
        uplinkTop: topDpiCategories(dpiUl, 10),
      },
      groups,
      lastSnapshot: latestSnap,
      trend24h,
      circuit: getCircuitState(),
    });
  } catch (error) {
    return apiServerError(error);
  }
}
