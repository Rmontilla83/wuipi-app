// ============================================
// CRON: Bequant sync — subscribers/groups/policies every 10 min
// ============================================
// Pulls 3 lightweight requests from BQN, upserts into Supabase.
// Enriches subscribers with Odoo mikrotik.service (match by ip_cpe/ipv4).
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  listSubscribers, listSubscriberGroups, listRatePolicies,
} from "@/lib/integrations/bequant";
import {
  upsertSyncedSubscribers, upsertSyncedGroups, upsertSyncedPolicies,
  fetchOdooEnrichmentMap,
} from "@/lib/dal/bequant";
import { isOdooConfigured } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const started = Date.now();
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch from BQN (3 calls)
    const [subs, groups, policies] = await Promise.all([
      listSubscribers(),
      listSubscriberGroups(),
      listRatePolicies(),
    ]);

    // 2. Build Odoo enrichment map (1 call to Odoo)
    const odooMap = isOdooConfigured()
      ? await fetchOdooEnrichmentMap()
      : new Map();

    // 3. Upsert in Supabase
    const [subResult, groupCount, policyCount] = await Promise.all([
      upsertSyncedSubscribers(subs, odooMap),
      upsertSyncedGroups(groups),
      upsertSyncedPolicies(policies),
    ]);

    const elapsed = Date.now() - started;
    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsed,
      subscribers: subResult.upserted,
      odoo_matched: subResult.matched,
      groups: groupCount,
      policies: policyCount,
    });
  } catch (err) {
    const msg = (err as Error).message || "unknown";
    console.error("[cron/bequant/sync]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
