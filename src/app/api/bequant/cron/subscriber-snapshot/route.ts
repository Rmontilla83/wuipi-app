// ============================================
// CRON: Per-subscriber snapshot — daily rotation
// ============================================
// Runs daily 04:00 VET (08:00 UTC). Processes 1/7 of active/suspended
// subscribers per run, deterministically partitioned by hash(ip) % 7 = dayOfWeek.
// Each sub gets refreshed ~weekly → snapshot is never older than 7 days
// for the universe of subscribers who never open the portal themselves.
// (Portal/admin endpoints do write-through on every live call, so active
//  users always have fresh snapshots within minutes.)
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  getSubscriberBandwidth, getSubscriberLatency, getSubscriberRetransmission,
  getSubscriberCongestion, getSubscriberTrafficAtMaxSpeed,
  lastValid,
} from "@/lib/integrations/bequant";
import { listSyncedSubscriberIps, upsertSubscriberSnapshots } from "@/lib/dal/bequant";
import { requireCronAuth } from "@/lib/auth/cron-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Keep waves small — semaphore = 20 and each sub needs 5 calls.
const WAVE_SIZE = 4;

// Stable hash for partitioning (same djb2 as dpi-monthly uses).
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return h >>> 0;
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  try {
    const unauth = requireCronAuth(request);
    if (unauth) return unauth;

    const dow = new Date().getUTCDay();
    const allIps = await listSyncedSubscriberIps();
    const batch = allIps.filter(ip => djb2(ip) % 7 === dow);

    let processed = 0;
    let persisted = 0;
    let failed = 0;
    const buffer: Array<{
      ip: string;
      download_kbps: number | null;
      upload_kbps: number | null;
      latency_ms: number | null;
      retransmission_pct: number | null;
      congestion_pct: number | null;
      traffic_at_max_speed: number | null;
      score: number | null;
      plan_mbps: number | null;
    }> = [];

    for (let i = 0; i < batch.length; i += WAVE_SIZE) {
      const wave = batch.slice(i, i + WAVE_SIZE);
      await Promise.all(wave.map(async ip => {
        try {
          const [bw, lat, retx, cong, tams] = await Promise.all([
            getSubscriberBandwidth(ip, 5, 6),
            getSubscriberLatency(ip, 5, 6),
            getSubscriberRetransmission(ip, 5, 6),
            getSubscriberCongestion(ip, 5, 6),
            getSubscriberTrafficAtMaxSpeed(ip, 5, 6),
          ]);
          processed++;

          const dlKbps = lastValid(bw?.dataDownlink);
          const ulKbps = lastValid(bw?.dataUplink);
          const latencyMs = lastValid(lat?.dataDownlink);
          const retxPct = lastValid(retx?.dataDownlink);
          const congPct = lastValid(cong?.dataDownlink);
          const tamsPct = lastValid(tams?.dataDownlink);

          // Only persist rows with at least one usable value
          if ([dlKbps, ulKbps, latencyMs, retxPct, congPct, tamsPct].every(v => v === null)) return;

          buffer.push({
            ip,
            download_kbps: dlKbps,
            upload_kbps: ulKbps,
            latency_ms: latencyMs,
            retransmission_pct: retxPct,
            congestion_pct: congPct,
            traffic_at_max_speed: tamsPct,
            score: null,
            plan_mbps: null,
          });
        } catch (err) {
          failed++;
          console.error(`[cron/sub-snapshot] ${ip}:`, (err as Error).message);
        }
      }));

      // Flush in chunks to bound memory
      if (buffer.length >= 200) {
        persisted += await upsertSubscriberSnapshots(buffer.splice(0));
      }

      // Safety brake
      if (Date.now() - started > 280_000) break;
    }

    if (buffer.length > 0) {
      persisted += await upsertSubscriberSnapshots(buffer);
    }

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      day_of_week: dow,
      batch_size: batch.length,
      processed,
      persisted,
      failed,
    });
  } catch (err) {
    const msg = (err as Error).message || "unknown";
    console.error("[cron/bequant/subscriber-snapshot]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
