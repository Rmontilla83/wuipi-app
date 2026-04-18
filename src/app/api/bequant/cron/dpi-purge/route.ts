// ============================================
// CRON: Purge per-subscriber monthly DPI older than 12 months
// Runs first day of month at 04:00 UTC.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { purgeOldMonthlyDpi } from "@/lib/dal/bequant";
import { requireCronAuth } from "@/lib/auth/cron-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const unauth = requireCronAuth(request);
    if (unauth) return unauth;

    const deleted = await purgeOldMonthlyDpi(12);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    const msg = (err as Error).message || "unknown";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
