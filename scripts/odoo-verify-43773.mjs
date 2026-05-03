// Verifica el estado actual de la factura 43773 (Rafael, $0.14, 2026-05-02)
// que dejó la cola odoo_sync_queue en manual_review con error
// "factura ya posted, no draft".
//
// Objetivo: confirmar si quedó posted con payment+reconcile (caso éxito real
// y solo hay que cerrar la cola) o si quedó posted SIN payment (problema real).

import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = env;

async function rpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "call", params: { service, method, args } }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.data?.message || data.error.message);
  return data.result;
}
const uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);

console.log("=== Factura 43773 — estado REAL ahora ===");
const inv = (await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "search_read",
  [[["id", "=", 43773]]],
  { fields: ["id", "name", "state", "payment_state", "currency_id", "amount_total",
             "amount_residual", "custom_month_billed", "month_billed",
             "invoice_date", "invoice_date_due", "invoice_origin",
             "create_date", "write_date", "partner_id"] }
]))[0];
if (!inv) { console.log("NO existe la factura 43773"); process.exit(0); }
for (const [k, v] of Object.entries(inv)) console.log(`  ${k}: ${JSON.stringify(v)}`);

// Buscar account.payment del partner en últimas 48h
console.log("\n=== Pagos recientes del partner 27804 (últimas 48h) ===");
const since = new Date(Date.now() - 48*3600*1000).toISOString().slice(0,19).replace("T"," ");
const pays = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.payment", "search_read",
  [[["partner_id", "=", 27804], ["create_date", ">=", since]]],
  { fields: ["id", "name", "state", "amount", "currency_id", "date",
             "journal_id", "payment_method_line_id", "reconciled_invoice_ids", "create_date"],
    order: "create_date desc", limit: 20 }
]);
console.log(`${pays.length} pagos:`);
for (const p of pays) {
  console.log(`  id=${p.id} name=${p.name} state=${p.state} amount=${p.amount} ` +
              `${p.currency_id?.[1]} date=${p.date} journal=${p.journal_id?.[1]} ` +
              `recon_invs=${JSON.stringify(p.reconciled_invoice_ids)} ref=${p.ref} create=${p.create_date}`);
}

// Buscar move lines de la factura 43773 (asientos contables) para ver reconcile
console.log("\n=== Move lines de la factura 43773 ===");
const lines = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move.line", "search_read",
  [[["move_id", "=", 43773]]],
  { fields: ["id", "name", "account_id", "debit", "credit", "amount_currency",
             "currency_id", "balance", "reconciled", "matched_debit_ids", "matched_credit_ids",
             "full_reconcile_id"], limit: 30 }
]);
for (const l of lines) {
  console.log(`  id=${l.id} acct=${l.account_id?.[1]} debit=${l.debit} credit=${l.credit} ` +
              `cur=${l.currency_id?.[1]} amt_cur=${l.amount_currency} reconciled=${l.reconciled} ` +
              `full_recon=${JSON.stringify(l.full_reconcile_id)}`);
}
