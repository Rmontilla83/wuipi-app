// Reproduce previewInvoicePosting localmente para ver el error completo
// que en Vercel sale truncado.

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
  if (data.error) {
    console.error("RPC error full:", JSON.stringify(data.error, null, 2));
    throw new Error(data.error.data?.message || data.error.message);
  }
  return data.result;
}

const uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);

// Replica getSubscriptionByName con el campo que probablemente falla
console.log("Probando getSubscriptionByName('S20548')...");
try {
  const list = await rpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "sale.order", "search_read",
    [[["name", "=", "S20548"]]],
    {
      fields: ["id", "name", "next_invoice_date", "subscription_plan_id", "is_subscription"],
      limit: 1,
    }
  ]);
  console.log("OK:", JSON.stringify(list, null, 2));
} catch (e) {
  console.log("FALLÓ:", e.message);
}

// Probar getInvoiceById que pide invoice_origin
console.log("\nProbando getInvoiceById(43350)...");
try {
  const list = await rpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "account.move", "search_read",
    [[["id", "=", 43350]]],
    {
      fields: ["id", "name", "partner_id", "state", "currency_id",
               "amount_total", "amount_untaxed", "amount_tax", "amount_residual",
               "invoice_date_due", "invoice_origin"],
      limit: 1,
    }
  ]);
  console.log("OK:", JSON.stringify(list, null, 2));
} catch (e) {
  console.log("FALLÓ:", e.message);
}

// Probar getInvoiceLines
console.log("\nProbando getInvoiceLines(43350)...");
try {
  const list = await rpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "account.move.line", "search_read",
    [[["move_id", "=", 43350], ["display_type", "=", "product"]]],
    {
      fields: ["id", "name", "product_id", "quantity", "price_unit",
               "price_subtotal", "price_total", "currency_id", "tax_ids", "account_id"],
      limit: 100,
    }
  ]);
  console.log("OK:", list.length, "líneas");
} catch (e) {
  console.log("FALLÓ:", e.message);
}
