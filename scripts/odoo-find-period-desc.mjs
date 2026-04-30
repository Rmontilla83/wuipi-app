// Busca dónde está la descripción "1 Meses 27-04-2026 hasta 26-05-2026"
// En la línea 98372 puede estar en name (que YA leímos = "[BM020SE] WUIPI Beam 20"),
// o en otro campo custom de account.move.line, o en sale.order.line origen.

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

// 1. Leer TODOS los campos de la línea 98372 para ver TODOS los valores
console.log("=== TODOS los campos de la línea 98372 (que tengan valor) ===");
const line = (await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move.line", "read",
  [[98372]],
  {}
]))[0];

for (const [k, v] of Object.entries(line)) {
  // Mostrar solo los que tengan valor "interesante"
  if (v === false || v === null || v === 0 || v === "" || (Array.isArray(v) && v.length === 0)) continue;
  // Skip campos contables muy verbose
  if (["amount_currency","balance","credit","debit","date","date_maturity"].includes(k)) continue;
  console.log(`  ${k}: ${JSON.stringify(v).slice(0, 120)}`);
}

// 2. Buscar la sale.order.line de S20548 que es origen
console.log("\n=== sale.order S20548 (id=55087) — líneas ===");
const orderLines = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "sale.order.line", "search_read",
  [[["order_id", "=", 55087]]],
  {}
]);
console.log(`${orderLines.length} líneas en la suscripción:`);
for (const l of orderLines) {
  console.log(`\n  --- Línea sale.order.line id=${l.id} ---`);
  for (const [k, v] of Object.entries(l)) {
    if (v === false || v === null || v === 0 || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    if (["create_uid","write_uid","create_date","write_date"].includes(k)) continue;
    console.log(`    ${k}: ${JSON.stringify(v).slice(0, 200)}`);
  }
}

// 3. Buscar otra factura draft de OTRO cliente para ver cómo se ve la descripción
//    "1 Meses ..."
console.log("\n=== Otra factura draft con descripción de periodo (otro cliente) ===");
const otherDraft = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "search_read",
  [[
    ["state", "=", "draft"],
    ["move_type", "=", "out_invoice"],
    ["partner_id", "!=", 27804],
  ]],
  { fields: ["id", "name", "partner_id", "invoice_origin", "currency_id", "amount_total"], limit: 1, order: "create_date desc" }
]);
if (otherDraft[0]) {
  console.log(`Factura draft ejemplo: id=${otherDraft[0].id} ${otherDraft[0].name} ${otherDraft[0].partner_id?.[1]}`);
  const otherLines = await rpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "account.move.line", "search_read",
    [[["move_id", "=", otherDraft[0].id], ["display_type", "=", "product"]]],
    { fields: ["id", "name", "product_id", "price_unit", "quantity"] }
  ]);
  for (const ol of otherLines) {
    console.log(`  línea id=${ol.id} name="${ol.name}"`);
  }
}
