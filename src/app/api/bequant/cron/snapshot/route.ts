// ============================================
// CRON: Bequant node snapshot — hourly
// ============================================
// Captures aggregate node metrics (no per-subscriber DPI) for trending.
// 8 lightweight BQN calls (~2s total with pool reuse).
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  getNodeVolume, getNodeLatency, getNodeCongestion, getNodeRetransmission,
  getNodeFlows, getNodeTrafficAtMaxSpeed, getNodeDpiDownlink, getNodeDpiUplink,
  lastValid, topDpiCategories,
} from "@/lib/integrations/bequant";
import { insertNodeSnapshot } from "@/lib/dal/bequant";
import type { BequantNodeSnapshot } from "@/types/bequant";
import { requireCronAuth } from "@/lib/auth/cron-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const started = Date.now();
  try {
    const unauth = requireCronAuth(request);
    if (unauth) return unauth;

    // Parallel fetch — undici Pool reuses TCP connections
    const [volume, latency, congestion, retransmission, flows, tams, dpiDl, dpiUl] =
      await Promise.all([
        getNodeVolume(5, 1),
        getNodeLatency(5, 1),
        getNodeCongestion(5, 1),
        getNodeRetransmission(5, 1),
        getNodeFlows(5, 1),
        getNodeTrafficAtMaxSpeed(5, 1),
        getNodeDpiDownlink(60, 1),
        getNodeDpiUplink(60, 1),
      ]);

    const snapshot: BequantNodeSnapshot = {
      takenAt: Date.now(),
      volumeDl: lastValid(volume?.dataDownlink),
      volumeUl: lastValid(volume?.dataUplink),
      latencyDl: lastValid(latency?.dataDownlink),
      latencyUl: lastValid(latency?.dataUplink),
      congestion: lastValid(congestion?.dataDownlink),
      retransmissionDl: lastValid(retransmission?.dataDownlink),
      retransmissionUl: lastValid(retransmission?.dataUplink),
      flowsActive: lastValid(flows?.flowsActive) !== null
        ? Math.round(lastValid(flows?.flowsActive) as number) : null,
      flowsCreated: lastValid(flows?.flowsCreated) !== null
        ? Math.round(lastValid(flows?.flowsCreated) as number) : null,
      trafficAtMaxSpeed: lastValid(tams?.dataDownlink),
      dpiDownlinkTop: topDpiCategories(dpiDl, 10),
      dpiUplinkTop: topDpiCategories(dpiUl, 10),
    };

    await insertNodeSnapshot(snapshot);

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      snapshot,
    });
  } catch (err) {
    const msg = (err as Error).message || "unknown";
    console.error("[cron/bequant/snapshot]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
