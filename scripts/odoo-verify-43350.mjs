// Verifica el estado actual de la factura 43350 + revisa otras facturas
// del mismo cliente para entender el patrón de custom_month_billed.

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

// 1. Re-leer factura 43350 con todos los campos relevantes
console.log("=== Factura 43350 — estado REAL ahora ===");
const inv = (await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "search_read",
  [[["id", "=", 43350]]],
  { fields: ["id", "name", "state", "payment_state", "currency_id", "amount_total",
             "amount_residual", "custom_month_billed", "month_billed",
             "invoice_date", "invoice_date_due", "invoice_origin", "create_date", "write_date"] }
]))[0];

for (const [k, v] of Object.entries(inv)) console.log(`  ${k}: ${JSON.stringify(v)}`);

// 2. Buscar OTRAS facturas (draft y posted) de Rafael para ver el patrón
console.log("\n=== Otras facturas de Rafael (todas las recientes) ===");
const others = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "search_read",
  [[
    ["partner_id", "=", 27804],
    ["move_type", "=", "out_invoice"],
  ]],
  {
    fields: ["id", "name", "state", "currency_id", "amount_total",
             "custom_month_billed", "month_billed",
             "invoice_date", "create_date"],
    limit: 15,
    order: "create_date desc"
  }
]);
console.log(`${others.length} facturas:`);
for (const m of others) {
  console.log(`  id=${m.id} name=${JSON.stringify(m.name)} state=${m.state} ` +
              `curr=${m.currency_id?.[1]} total=${m.amount_total} ` +
              `custom_mb=${m.custom_month_billed} mb=${JSON.stringify(m.month_billed)} ` +
              `inv_date=${m.invoice_date} create=${m.create_date}`);
}

// 3. Ver los campos completos de UNA factura posted antigua (que ya tenga
//    valor en month_billed, si existe).
console.log("\n=== Buscar facturas con month_billed lleno (cualquier cliente) ===");
const examples = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "search_read",
  [[
    ["custom_month_billed", "=", true],
    ["month_billed", "!=", false],
    ["state", "=", "posted"],
  ]],
  {
    fields: ["id", "name", "partner_id", "state", "month_billed", "custom_month_billed",
             "invoice_date", "amount_total", "currency_id"],
    limit: 10,
    order: "create_date desc"
  }
]);
console.log(`${examples.length} ejemplos con month_billed lleno:`);
for (const m of examples) {
  console.log(`  id=${m.id} name=${m.name} partner=${m.partner_id?.[1]} ` +
              `month_billed="${m.month_billed}" inv_date=${m.invoice_date} ` +
              `total=${m.amount_total} ${m.currency_id?.[1]}`);
}
