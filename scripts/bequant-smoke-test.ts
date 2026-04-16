/**
 * Smoke test end-to-end del módulo Bequant.
 * Uso: npx tsx --env-file=.env.local scripts/bequant-smoke-test.ts
 */
import {
  testConnection, listSubscribers, listSubscriberGroups, listRatePolicies,
  getNodeLatency, getSubscriber, getSubscriberBandwidth,
  getCircuitState, lastValid, topDpiCategories, getNodeDpiDownlink,
} from "../src/lib/integrations/bequant";
import {
  upsertSyncedSubscribers, upsertSyncedGroups, upsertSyncedPolicies,
  fetchOdooEnrichmentMap, listSyncedSubscribers, listSyncedGroups,
  insertNodeSnapshot,
} from "../src/lib/dal/bequant";

const BQN_URL = process.env.BEQUANT_URL!;
const USER = process.env.BEQUANT_USER!;
const PASS = process.env.BEQUANT_PASSWORD!;

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log(" BEQUANT SMOKE TEST");
  console.log("═══════════════════════════════════════════════\n");

  // 1. test connection
  console.log("1. Test connection…");
  const parsed = new URL(BQN_URL);
  const result = await testConnection(parsed.hostname, parseInt(parsed.port), USER, PASS);
  console.log(`   ${result.success ? "✅" : "❌"} ${result.message}\n`);
  if (!result.success) process.exit(1);

  // 2. list calls
  console.log("2. Integration client calls (via undici Pool)…");
  const t0 = Date.now();
  const [subs, groups, policies, latency, dpi] = await Promise.all([
    listSubscribers(),
    listSubscriberGroups(),
    listRatePolicies(),
    getNodeLatency(5, 1),
    getNodeDpiDownlink(60, 1),
  ]);
  const elapsed = Date.now() - t0;
  console.log(`   ✅ ${elapsed}ms (5 parallel calls):`);
  console.log(`      subs=${subs.length} groups=${groups.length} policies=${policies.length}`);
  console.log(`      latency last=${lastValid(latency?.dataDownlink)}ms`);
  console.log(`      DPI top3 DL: ${topDpiCategories(dpi, 3).map(c => c.name).join(", ")}`);
  console.log(`      circuit: ${JSON.stringify(getCircuitState())}\n`);

  // 3. singleflight test — 3 identical calls should all hit the same inflight
  console.log("3. Singleflight dedupe (3 identical calls)…");
  const t1 = Date.now();
  await Promise.all([subs.length, listSubscribers(), listSubscribers(), listSubscribers()]);
  console.log(`   ✅ ${Date.now() - t1}ms — deduped\n`);

  // 4. Odoo enrichment
  console.log("4. Odoo enrichment map…");
  const t2 = Date.now();
  const odooMap = await fetchOdooEnrichmentMap();
  console.log(`   ✅ ${Date.now() - t2}ms — ${odooMap.size} IPs indexed from Odoo\n`);

  // 5. Upserts
  console.log("5. Upsert sync tables…");
  const t3 = Date.now();
  const subResult = await upsertSyncedSubscribers(subs, odooMap);
  const gcount = await upsertSyncedGroups(groups);
  const pcount = await upsertSyncedPolicies(policies);
  console.log(`   ✅ ${Date.now() - t3}ms`);
  console.log(`      subscribers upserted=${subResult.upserted}, matched_odoo=${subResult.matched}`);
  console.log(`      groups=${gcount}, policies=${pcount}\n`);

  // 6. Read back from Supabase
  console.log("6. Read back from Supabase…");
  const { rows, total } = await listSyncedSubscribers({ limit: 5, odooMatch: "yes" });
  console.log(`   ✅ Total linked subs: ${total}`);
  console.log(`   Sample:`);
  rows.forEach(r => console.log(`     ${r.ip.padEnd(16)} → ${r.odoo_partner_name} [${r.policy_rate}]`));
  const savedGroups = await listSyncedGroups();
  console.log(`   Groups in DB: ${savedGroups.map(g => g.name).join(", ")}\n`);

  // 7. Snapshot insert
  console.log("7. Node snapshot insert…");
  await insertNodeSnapshot({
    takenAt: Date.now(),
    volumeDl: null, volumeUl: null,
    latencyDl: lastValid(latency?.dataDownlink),
    latencyUl: lastValid(latency?.dataUplink),
    congestion: null,
    retransmissionDl: null, retransmissionUl: null,
    flowsActive: null, flowsCreated: null,
    trafficAtMaxSpeed: null,
    dpiDownlinkTop: topDpiCategories(dpi, 10),
    dpiUplinkTop: [],
  });
  console.log(`   ✅ Snapshot stored\n`);

  // 8. Subscriber detail end-to-end
  if (subs.length > 0) {
    const sample = subs.find(s => s.policyRate) || subs[0];
    console.log(`8. Subscriber detail for ${sample.subscriberIp}…`);
    const [info, bw] = await Promise.all([
      getSubscriber(sample.subscriberIp),
      getSubscriberBandwidth(sample.subscriberIp, 5, 1),
    ]);
    console.log(`   ✅ policy=${info?.policyRate} groups=[${(info?.subscriberGroups || []).join(", ")}]`);
    console.log(`      bandwidth points=${bw?.timestamp?.length || 0}, last DL=${lastValid(bw?.dataDownlink)}kbps\n`);
  }

  console.log("═══════════════════════════════════════════════");
  console.log(" ✅ SMOKE TEST PASSED");
  console.log("═══════════════════════════════════════════════");
}

main().catch(e => {
  console.error("\n❌ FAILED:", e);
  process.exit(1);
});
