// FASE 0 — Exploración SOLO LECTURA de Odoo para Rafael Eduardo Montilla Olivares.
// Cédula: 16006905
//
// Este script NO escribe nada en Odoo. Solo busca y muestra:
//  1. El partner_id de Rafael (matchea por VAT/vat/ref con la cédula)
//  2. Las facturas draft de ese partner (account.move state=draft type=out_invoice)
//  3. La tasa BCV actual (res.currency.rate de VED para el día de hoy)
//  4. Las líneas de la factura draft (con monto USD)
//  5. Calcula el monto VES esperado (USD * tasa BCV)
//
// Uso: node scripts/odoo-explore-rafael.mjs

import { readFileSync } from "node:fs";

// ---- Carga env desde .env.local ----
const envText = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
  envText.split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const ODOO_URL = env.ODOO_URL;
const ODOO_DB = env.ODOO_DB;
const ODOO_USER = env.ODOO_USER;
const ODOO_API_KEY = env.ODOO_API_KEY;

if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_API_KEY) {
  console.error("Faltan credenciales Odoo en .env.local");
  process.exit(1);
}

console.log(`Odoo: ${ODOO_URL} | DB: ${ODOO_DB} | User: ${ODOO_USER}\n`);

// ---- JSON-RPC helper ----
async function rpc(service, method, args) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "call",
      params: { service, method, args },
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Odoo RPC error: ${data.error.data?.message || data.error.message}`);
  }
  return data.result;
}

async function searchRead(uid, model, domain, fields, limit) {
  const kwargs = { fields };
  if (limit) kwargs.limit = limit;
  return rpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, "search_read",
    [domain],
    kwargs,
  ]);
}

// ---- 1. Autenticar ----
console.log("=== 1. Autenticación ===");
const uid = await rpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
if (!uid) {
  console.error("Autenticación falló");
  process.exit(1);
}
console.log(`UID: ${uid}\n`);

// ---- 2. Buscar partner por cédula ----
console.log("=== 2. Buscar partner Rafael (cédula 16006905) ===");
// En Odoo VE las cédulas se guardan típicamente en vat con formato "V-16006905" o "V16006905"
// o en l10n_ve_dni o en ref. Probamos varios.
const cedulaCandidates = ["16006905", "V16006905", "V-16006905", "V16.006.905", "V-16.006.905"];
const partnerSearches = [];
for (const ced of cedulaCandidates) {
  const found = await searchRead(uid, "res.partner",
    ["|", "|", ["vat", "=", ced], ["ref", "=", ced], ["name", "ilike", "Rafael Eduardo Montilla"]],
    ["id", "name", "vat", "ref", "email", "phone", "is_company", "customer_rank", "credit", "active"],
    5
  );
  if (found.length > 0) {
    partnerSearches.push({ ced, found });
  }
}

const allPartners = new Map();
for (const ps of partnerSearches) {
  for (const p of ps.found) allPartners.set(p.id, p);
}
console.log(`Encontrados ${allPartners.size} candidatos:\n`);
for (const p of allPartners.values()) {
  console.log(`  - id=${p.id} | name="${p.name}" | vat="${p.vat || ''}" | ref="${p.ref || ''}" | email="${p.email || ''}" | rank=${p.customer_rank} | credit=${p.credit} | active=${p.active}`);
}

if (allPartners.size === 0) {
  console.error("\n❌ No se encontró ningún partner. Revisar formato de cédula.");
  process.exit(1);
}

// Pickear el más probable: nombre exacto + customer_rank > 0
const partners = [...allPartners.values()];
const target = partners.find(p => /Rafael Eduardo Montilla/i.test(p.name) && p.customer_rank > 0)
  || partners.find(p => /Rafael Eduardo Montilla/i.test(p.name))
  || partners[0];
console.log(`\n✅ Target: id=${target.id} "${target.name}"\n`);

// ---- 3. Suscripciones activas de Rafael ----
console.log("=== 3. Suscripciones activas de Rafael ===");
// En Odoo 18 las suscripciones son sale.order con is_subscription=true
const subs = await searchRead(uid, "sale.order",
  [
    ["partner_id", "=", target.id],
    ["state", "in", ["sale", "done"]],
  ],
  ["id", "name", "state", "subscription_state", "is_subscription",
   "amount_total", "currency_id", "date_order", "next_invoice_date",
   "first_contract_date"],
  10
);
console.log(`${subs.length} sale.order activos:`);
for (const s of subs) {
  console.log(`  - id=${s.id} | name="${s.name}" | state=${s.state} | sub_state=${s.subscription_state || '-'}`);
  console.log(`    is_subscription=${s.is_subscription} | total=${s.amount_total} ${s.currency_id?.[1]}`);
  console.log(`    fecha_orden=${s.date_order} | proxima_factura=${s.next_invoice_date} | inicio_contrato=${s.first_contract_date}`);
  console.log("");
}

// ---- 4. Buscar facturas draft de ese partner ----
console.log("=== 4. Facturas draft de Rafael (TODAS) ===");
const drafts = await searchRead(uid, "account.move",
  [
    ["partner_id", "=", target.id],
    ["state", "=", "draft"],
    ["move_type", "=", "out_invoice"],
  ],
  ["id", "name", "ref", "invoice_date", "invoice_date_due", "amount_total",
   "amount_total_signed", "amount_residual", "amount_untaxed", "currency_id", "state",
   "payment_state", "invoice_origin", "narration", "create_date", "write_date",
   "invoice_user_id"],
  20
);
console.log(`Encontradas ${drafts.length} facturas draft:\n`);
for (const inv of drafts) {
  console.log(`  - id=${inv.id}`);
  console.log(`    name (numero secuencial): "${inv.name === false ? 'Sin asignar (draft sin numerar)' : inv.name}"`);
  console.log(`    ref (referencia externa): "${inv.ref || '-'}"`);
  console.log(`    fecha factura: ${inv.invoice_date || 'sin asignar'}`);
  console.log(`    venc: ${inv.invoice_date_due || '-'}`);
  console.log(`    untaxed: ${inv.amount_untaxed} | total: ${inv.amount_total} ${inv.currency_id?.[1] || '?'}`);
  console.log(`    residual: ${inv.amount_residual} | payment_state: ${inv.payment_state || '-'}`);
  console.log(`    origin (orden generadora): "${inv.invoice_origin || '-'}"`);
  console.log(`    creado: ${inv.create_date} | última modif: ${inv.write_date}`);
  console.log(`    creado por: ${inv.invoice_user_id?.[1] || '-'}`);
  console.log("");
}

if (drafts.length === 0) {
  console.error("❌ No hay facturas draft. No se puede proceder con la prueba.");
  process.exit(1);
}

// ---- 4. Tasa BCV actual ----
// CONTEXTO: la moneda base de la company en Odoo es VED (rate=1).
// Las tasas históricas están en res.currency.rate vinculadas a USD.
// La rate del campo res.currency.rate.rate es: "cuántos USD vale 1 VED"
// Ej: rate=0.0020567 → 1 VED = 0.0020567 USD → 1 USD = 1/0.0020567 ≈ 486.19 Bs
// Conversión de factura USD a VES: monto_ves = monto_usd / rate_usd
console.log("=== 4. Tasa BCV actual ===");
const currencies = await searchRead(uid, "res.currency",
  [["name", "in", ["VED", "USD", "VEF"]]],
  ["id", "name", "symbol", "rate", "active"],
  10
);
console.log("Monedas:");
for (const c of currencies) {
  console.log(`  - id=${c.id} | name=${c.name} | symbol=${c.symbol} | rate (live)=${c.rate} | active=${c.active}`);
}

const usd = currencies.find(c => c.name === "USD");
const ved = currencies.find(c => c.name === "VED");
if (!usd || !ved) {
  console.error("❌ No se encontró USD o VED en Odoo");
  process.exit(1);
}

// Tasas históricas de USD
const rates = await searchRead(uid, "res.currency.rate",
  [["currency_id", "=", usd.id]],
  ["id", "name", "rate", "inverse_company_rate", "company_id"],
  10
);
console.log(`\nÚltimas tasas USD (de res.currency.rate):`);
const sorted = rates.sort((a, b) => b.name.localeCompare(a.name));
for (const r of sorted.slice(0, 5)) {
  const bsPerUsd = r.rate > 0 ? (1 / r.rate).toFixed(4) : "?";
  console.log(`  - fecha=${r.name} | rate=${r.rate} | inverse=${r.inverse_company_rate} | 1 USD = ${bsPerUsd} Bs`);
}

const latestRate = sorted[0];
const liveRate = usd.rate; // rate "live" del campo computed
console.log(`\nTasa histórica más reciente: ${latestRate.name} | rate=${latestRate.rate}`);
console.log(`Tasa LIVE (lo que Odoo usa al postear hoy): ${liveRate} → 1 USD = ${(1/liveRate).toFixed(4)} Bs`);

// ---- 5. Líneas de la primera factura draft ----
console.log("\n=== 5. Líneas de la factura draft ===");
const targetInvoice = drafts[0];
console.log(`Factura: id=${targetInvoice.id} "${targetInvoice.name}" | total=${targetInvoice.amount_total} ${targetInvoice.currency_id?.[1]}`);

const lines = await searchRead(uid, "account.move.line",
  [["move_id", "=", targetInvoice.id], ["display_type", "=", "product"]],
  ["id", "name", "product_id", "quantity", "price_unit", "price_subtotal",
   "price_total", "currency_id", "tax_ids", "account_id"],
  50
);
console.log(`\n${lines.length} líneas de producto:`);
for (const l of lines) {
  console.log(`  - id=${l.id} | producto="${l.product_id?.[1] || '-'}"`);
  console.log(`    cantidad=${l.quantity} | precio_unit=${l.price_unit} | subtotal=${l.price_subtotal} | total=${l.price_total} ${l.currency_id?.[1] || '?'}`);
  console.log(`    cuenta=${l.account_id?.[1] || '-'} | impuestos=${l.tax_ids?.length || 0}`);
}

// ---- 6. Cálculo de conversión esperado ----
console.log("\n=== 6. Cálculo conversión USD → VES ===");
const totalUsd = targetInvoice.amount_total;
// Confirmado por webhook real: 544.54 / 1.12 = 486.19 Bs/USD
// Y la rate live = 0.0020567 → 1/0.0020567 = 486.19 ✅
// Fórmula: monto_ves = monto_usd / rate_usd (donde rate es res.currency.rate.rate o res.currency.rate live)
const bsPerUsd = 1 / liveRate;
const totalVes = totalUsd / liveRate;
console.log(`Total USD: $${totalUsd}`);
console.log(`Bs por USD (live): ${bsPerUsd.toFixed(4)}`);
console.log(`Total VES esperado: ${totalVes.toFixed(2)} Bs`);
console.log(`\nValidación cruzada con webhook anterior: 544.54 Bs / 1.12 USD = ${(544.54/1.12).toFixed(4)} Bs/USD ← debe coincidir con bsPerUsd`);

// ---- 7. Resumen para validación ----
console.log("\n" + "=".repeat(70));
console.log("RESUMEN PARA VALIDACIÓN");
console.log("=".repeat(70));
console.log(`Partner ID:          ${target.id}`);
console.log(`Partner Nombre:      ${target.name}`);
console.log(`Partner VAT:         ${target.vat || target.ref || '-'}`);
console.log(`Partner Email:       ${target.email || '-'}`);
console.log(``);
console.log(`Factura ID:          ${targetInvoice.id}`);
console.log(`Factura Estado:      ${targetInvoice.state}`);
console.log(`Factura Total USD:   $${totalUsd}`);
console.log(`Factura Moneda:      ${targetInvoice.currency_id?.[1]}`);
console.log(``);
console.log(`Moneda Base Company: VED (rate=1)`);
console.log(`Moneda USD Live Rate: ${liveRate}`);
console.log(`Tasa BCV (Bs/USD):   ${bsPerUsd.toFixed(4)}`);
console.log(``);
console.log(`Total VES esperado:  ${totalVes.toFixed(2)} Bs`);
console.log(``);
console.log(`>>> El sync va a: cambiar currency_id de la factura ${targetInvoice.id} a VED,`);
console.log(`    recalcular cada price_unit × ${bsPerUsd.toFixed(4)},`);
console.log(`    y action_post para que quede como factura posted en ${totalVes.toFixed(2)} Bs.`);
console.log("=".repeat(70));
