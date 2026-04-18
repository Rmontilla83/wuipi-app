// ============================================
// CRON: Per-subscriber DPI monthly — weekly rotation
// ============================================
// Runs daily 03:00 VET (07:00 UTC). Processes 1/7 of Odoo-linked subscribers
// per run, deterministically partitioned by hash(ip) % 7 = dayOfWeek.
// Each sub is sampled ~4-5 times per month → representative app-usage profile.
// Fetches 24h DPI from BQN (1h interval), merges into bequant_subscriber_dpi_monthly.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  getSubscriberDpiDownlink, getSubscriberDpiUplink, topDpiCategories,
} from "@/lib/integrations/bequant";
import { getDpiRotationBatch, upsertMonthlyDpiSample } from "@/lib/dal/bequant";
import { requireCronAuth } from "@/lib/auth/cron-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Avoid hammering BQN: process in small waves.
const WAVE_SIZE = 8;

export async function GET(request: NextRequest) {
  const started = Date.now();
  try {
    const unauth = requireCronAuth(request);
    if (unauth) return unauth;

    // Deterministic partition: day-of-week 0..6 (Sunday=0)
    const dow = new Date().getUTCDay();
    const ips = await getDpiRotationBatch(dow);

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < ips.length; i += WAVE_SIZE) {
      const wave = ips.slice(i, i + WAVE_SIZE);
      await Promise.all(wave.map(async ip => {
        try {
          const [dl, ul] = await Promise.all([
            getSubscriberDpiDownlink(ip, 60, 24),
            getSubscriberDpiUplink(ip, 60, 24),
          ]);
          const dlTop = topDpiCategories(dl, 20);
          const ulTop = topDpiCategories(ul, 20);
          if (dlTop.length === 0 && ulTop.length === 0) return; // no traffic this day
          await upsertMonthlyDpiSample({ ip, dl: dlTop, ul: ulTop });
          processed++;
        } catch (err) {
          failed++;
          console.error(`[dpi-monthly] ${ip}:`, (err as Error).message);
        }
      }));

      // Safety: stop if approaching timeout
      if (Date.now() - started > 280_000) break;
    }

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      day_of_week: dow,
      partition_size: ips.length,
      processed,
      failed,
    });
  } catch (err) {
    const msg = (err as Error).message || "unknown";
    console.error("[cron/dpi-monthly]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
