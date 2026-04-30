// Lee TODOS los campos de la factura 43350 (incluyendo custom) y de su línea,
// para identificar los campos "Mes facturado personalizado" y "Mes(es) facturado(s)".
// Solo lectura.

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
console.log(`UID: ${uid}\n`);

// 1. Listar TODOS los campos del modelo account.move
console.log("=== Campos de account.move (filtrando los que parecen relevantes) ===");
const moveFields = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "fields_get",
  [],
  { attributes: ["string", "type", "help"] }
]);

// Filtrar campos que mencionen "mes", "month", "personaliz", "custom", "billed", "facturad", "x_"
const relevantMove = Object.entries(moveFields).filter(([name, info]) => {
  const text = (name + " " + (info.string || "") + " " + (info.help || "")).toLowerCase();
  return /\b(mes|month|personaliz|custom|billed|facturad|periodo|period)\b/.test(text)
      || name.startsWith("x_");
});
console.log(`${relevantMove.length} campos potencialmente relevantes en account.move:`);
for (const [name, info] of relevantMove) {
  console.log(`  ${name} (${info.type}): "${info.string}"${info.help ? ` — ${info.help.slice(0, 80)}` : ""}`);
}

console.log("\n=== Campos de account.move.line (filtrando los que parecen relevantes) ===");
const lineFields = await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move.line", "fields_get",
  [],
  { attributes: ["string", "type", "help"] }
]);
const relevantLine = Object.entries(lineFields).filter(([name, info]) => {
  const text = (name + " " + (info.string || "") + " " + (info.help || "")).toLowerCase();
  return /\b(mes|month|personaliz|custom|billed|facturad|periodo|period)\b/.test(text)
      || name.startsWith("x_");
});
console.log(`${relevantLine.length} campos potencialmente relevantes en account.move.line:`);
for (const [name, info] of relevantLine) {
  console.log(`  ${name} (${info.type}): "${info.string}"${info.help ? ` — ${info.help.slice(0, 80)}` : ""}`);
}

// 2. Leer la factura posteada con TODOS los campos (incluyendo custom)
console.log("\n=== Factura 43350 — todos los valores no-falsy ===");
const invoice = (await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move", "read",
  [[43350]],
  {}
]))[0];

if (!invoice) {
  console.log("Factura no encontrada");
  process.exit(1);
}

// Mostrar solo campos custom (x_) y los identificados como relevantes
const allRelevantNames = new Set([
  ...relevantMove.map(([n]) => n),
  "name", "state", "currency_id", "amount_total", "invoice_origin", "narration"
]);
for (const [field, value] of Object.entries(invoice)) {
  if (allRelevantNames.has(field) || field.startsWith("x_")) {
    console.log(`  ${field}: ${JSON.stringify(value)}`);
  }
}

// 3. Leer la línea con todos los campos
console.log("\n=== Línea 98372 — todos los valores no-falsy ===");
const line = (await rpc("object", "execute_kw", [
  ODOO_DB, uid, ODOO_API_KEY,
  "account.move.line", "read",
  [[98372]],
  {}
]))[0];

if (!line) {
  console.log("Línea no encontrada");
  process.exit(1);
}

const allRelevantLineNames = new Set([
  ...relevantLine.map(([n]) => n),
  "name", "product_id", "quantity", "price_unit", "price_subtotal", "price_total",
  "currency_id", "tax_ids", "account_id"
]);
for (const [field, value] of Object.entries(line)) {
  if (allRelevantLineNames.has(field) || field.startsWith("x_")) {
    console.log(`  ${field}: ${JSON.stringify(value)}`);
  }
}

// 4. Mostrar el campo `name` completo de la línea (que tiene la descripción "1 Meses 27-04-2026 hasta 26-05-2026")
console.log(`\n=== Descripción completa de la línea ===`);
console.log(`  name: "${line.name}"`);
