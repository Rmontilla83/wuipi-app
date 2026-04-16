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

    // Live node metrics (8 calls, undici pool reuses connections, singleflight dedupes)
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

    return apiSuccess({
      live: {
        volume, latency, congestion, retransmission, flows,
        trafficAtMaxSpeed: tams,
      },
      kpis: {
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
