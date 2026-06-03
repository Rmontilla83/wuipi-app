// Reconcilia el estado de odoo_sync_queue + huérfanos paid contra
// erp.wuipi.net. NO escribe a Odoo. NO crea payments. Solo lee y clasifica.
//
// Output: exports/reconcile-report-{stamp}.json con la clasificación completa.
// El reporte se usa después para decidir qué items marcar como resueltos.
//
// Uso: node scripts/reconcile-odoo-sync-state.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ODOO = env.ODOO_BASE_URL;
const DB = "wuipi";
const LOGIN = env.ODOO_INT_LOGIN;
const KEY = env.ODOO_INT_API_KEY;

async function rpc(service, method, args) {
  const r = await fetch(`${ODOO}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: { service, method, args } }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.data?.message || d.error.message);
  return d.result;
}

console.log(`Conectando a ${ODOO} db=${DB}...`);
const uid = await rpc("common", "authenticate", [DB, LOGIN, KEY, {}]);
console.log(`OK uid=${uid}\n`);

// 1) Cargar items en cola NO resueltos
const { data: queueItems } = await sb
  .from("odoo_sync_queue")
  .select("id, collection_item_id, status, attempts, odoo_invoice_id, last_error, resolved_manually")
  .eq("resolved_manually", false)
  .in("status", ["pending", "retrying", "manual_review"]);

// 2) Cargar huérfanos: paid sin entrada en cola
const { data: paidRecent } = await sb
  .from("collection_items")
  .select("id, paid_at, amount_usd, payment_method, customer_name, customer_cedula_rif, metadata")
  .eq("status", "paid")
  .gte("paid_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

const { data: inQueueRaw } = await sb
  .from("odoo_sync_queue")
  .select("collection_item_id");
const idsInQueue = new Set((inQueueRaw || []).map((r) => r.collection_item_id));
const orphans = (paidRecent || []).filter((r) => !idsInQueue.has(r.id));

// 3) Cargar metadata de los collection_items de la cola
const queueCiIds = queueItems.map((q) => q.collection_item_id);
const { data: queueCis } = await sb
  .from("collection_items")
  .select("id, paid_at, amount_usd, payment_method, customer_name, customer_cedula_rif, metadata")
  .in("id", queueCiIds);
const ciByQueue = Object.fromEntries((queueCis || []).map((ci) => [ci.id, ci]));

console.log(`En cola NO resuelta: ${queueItems.length}`);
console.log(`Huérfanos paid sin cola: ${orphans.length}\n`);

// 4) Para cada item, extraer todos los invoice IDs únicos
function getInvoiceIds(ci) {
  const meta = ci?.metadata || {};
  const ids = Array.isArray(meta.odoo_invoice_ids)
    ? meta.odoo_invoice_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  return ids;
}

const allInvoiceIds = new Set();
for (const q of queueItems) {
  const ci = ciByQueue[q.collection_item_id];
  getInvoiceIds(ci).forEach((id) => allInvoiceIds.add(id));
  if (q.odoo_invoice_id) allInvoiceIds.add(q.odoo_invoice_id);
}
for (const ci of orphans) {
  getInvoiceIds(ci).forEach((id) => allInvoiceIds.add(id));
}

const idList = Array.from(allInvoiceIds);
console.log(`Total facturas únicas a verificar en erp.wuipi.net: ${idList.length}`);

// 5) Batch read account.move
const invoices = await rpc("object", "execute_kw", [
  DB, uid, KEY, "account.move", "read",
  [idList, ["id", "name", "state", "payment_state", "amount_total", "amount_residual", "currency_id", "partner_id"]],
]);
const invMap = Object.fromEntries(invoices.map((m) => [m.id, m]));
console.log(`Encontradas en Odoo: ${invoices.length} / ${idList.length}`);

// 6) Para cada factura paid o partial, buscar payments asociados (para audit)
const paidOrPartial = invoices
  .filter((m) => m.state === "posted" && ["paid", "partial", "in_payment"].includes(m.payment_state))
  .map((m) => m.id);

// Buscar payments via reconciled_invoice_ids
let paymentsByInvoice = {};
if (paidOrPartial.length > 0) {
  const payments = await rpc("object", "execute_kw", [
    DB, uid, KEY, "account.payment", "search_read",
    [[["reconciled_invoice_ids", "in", paidOrPartial]]],
    {
      fields: ["id", "name", "date", "amount", "currency_id", "journal_id", "memo", "state", "reconciled_invoice_ids", "create_date"],
      order: "create_date desc",
      limit: 500,
    },
  ]);
  for (const p of payments) {
    for (const invId of p.reconciled_invoice_ids || []) {
      if (!paymentsByInvoice[invId]) paymentsByInvoice[invId] = [];
      paymentsByInvoice[invId].push({
        id: p.id, name: p.name, date: p.date, amount: p.amount,
        currency: p.currency_id?.[1], journal: p.journal_id?.[1],
        memo: p.memo, state: p.state, create_date: p.create_date,
      });
    }
  }
}

// 7) Clasificar cada item
function classifyItem(invoiceIds) {
  const found = invoiceIds.map((id) => invMap[id]).filter(Boolean);
  const missing = invoiceIds.filter((id) => !invMap[id]);

  if (found.length === 0) return { class: "D_not_found", details: { missing } };

  const allPaid = found.every((m) => m.state === "posted" && (m.payment_state === "paid" || (m.payment_state === "in_payment" && Number(m.amount_residual) === 0)));
  const anyPartial = found.some((m) => m.payment_state === "partial");
  const anyDraft = found.some((m) => m.state === "draft");

  if (anyDraft) return { class: "C_draft", details: { invoices: found } };
  if (anyPartial) return { class: "B_partial", details: { invoices: found } };
  if (allPaid && missing.length === 0) return { class: "A_paid", details: { invoices: found } };
  if (allPaid && missing.length > 0) return { class: "A_paid_with_missing", details: { invoices: found, missing } };
  return { class: "Z_other", details: { invoices: found, missing } };
}

const report = {
  generated_at: new Date().toISOString(),
  source: { odoo_url: ODOO, odoo_db: DB },
  totals: { in_queue: queueItems.length, orphans: orphans.length },
  classification: { A_paid: [], A_paid_with_missing: [], B_partial: [], C_draft: [], D_not_found: [], Z_other: [] },
};

for (const q of queueItems) {
  const ci = ciByQueue[q.collection_item_id];
  if (!ci) continue;
  const ids = getInvoiceIds(ci).length > 0 ? getInvoiceIds(ci) : (q.odoo_invoice_id ? [q.odoo_invoice_id] : []);
  const c = classifyItem(ids);
  report.classification[c.class].push({
    source: "queue",
    queue_id: q.id,
    collection_item_id: q.collection_item_id,
    customer: ci.customer_name,
    cedula: ci.customer_cedula_rif,
    paid_at: ci.paid_at,
    amount_usd: ci.amount_usd,
    payment_method: ci.payment_method,
    last_error: q.last_error?.slice(0, 200),
    invoice_ids: ids,
    invoices_state: c.details.invoices?.map((m) => `${m.id}:${m.name} ${m.state}/${m.payment_state} resid=${m.amount_residual}`) || [],
    missing_ids: c.details.missing || [],
    payments: ids.flatMap((id) => (paymentsByInvoice[id] || []).map((p) => `inv${id}: ${p.name} ${p.amount} ${p.currency} ${p.date} ${p.journal} memo=${p.memo || "-"}`)),
  });
}

for (const ci of orphans) {
  const ids = getInvoiceIds(ci);
  const c = classifyItem(ids);
  report.classification[c.class].push({
    source: "orphan",
    collection_item_id: ci.id,
    customer: ci.customer_name,
    cedula: ci.customer_cedula_rif,
    paid_at: ci.paid_at,
    amount_usd: ci.amount_usd,
    payment_method: ci.payment_method,
    invoice_ids: ids,
    invoices_state: c.details.invoices?.map((m) => `${m.id}:${m.name} ${m.state}/${m.payment_state} resid=${m.amount_residual}`) || [],
    missing_ids: c.details.missing || [],
    payments: ids.flatMap((id) => (paymentsByInvoice[id] || []).map((p) => `inv${id}: ${p.name} ${p.amount} ${p.currency} ${p.date} ${p.journal} memo=${p.memo || "-"}`)),
  });
}

// 8) Stats
console.log("\n=== RESULTADO DE CLASIFICACIÓN ===\n");
for (const [k, arr] of Object.entries(report.classification)) {
  const usd = arr.reduce((s, x) => s + (Number(x.amount_usd) || 0), 0);
  console.log(`  ${k.padEnd(25)} → ${String(arr.length).padStart(4)} items | $${usd.toFixed(2)}`);
}

// 9) Escribir reporte
try { mkdirSync("exports", { recursive: true }); } catch {}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const file = `exports/reconcile-report-${stamp}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\n✅ Reporte: ${file}\n`);
