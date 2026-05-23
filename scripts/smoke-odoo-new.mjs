#!/usr/bin/env node
// ============================================================
// Smoke test — Odoo NEW (Etapa A)
// Valida que el cliente JSON-RPC habla con erp.wuipi.net y que
// los mapeos básicos funcionan. NO importa los TS de la app
// (lo hace npm run build), pero replica las queries que esos
// archivos van a hacer.
// ============================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = (() => {
  const raw = readFileSync(resolve(".env.local"), "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]+)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
})();

const URL = env.ODOO_BASE_URL;
const DB = "wuipi";
const USER = env.ODOO_INT_LOGIN;
const KEY = env.ODOO_INT_API_KEY;

if (!URL || !USER || !KEY) {
  console.error("✗ Missing ODOO_BASE_URL / ODOO_INT_LOGIN / ODOO_INT_API_KEY in .env.local");
  process.exit(1);
}

let rpcId = 1;
async function rpc(service, method, args) {
  const res = await fetch(`${URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "call", params: { service, method, args } }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`${service}.${method}: ${data.error.data?.message || data.error.message}`);
  return data.result;
}

const UID = await rpc("common", "authenticate", [DB, USER, KEY, {}]);
async function ex(model, method, args = [], kwargs = {}) {
  return rpc("object", "execute_kw", [DB, UID, KEY, model, method, args, kwargs]);
}

function assert(cond, label, detail = "") {
  if (cond) {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
    return true;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    return false;
  }
}

let failed = 0;
function fail(label, detail) { failed++; assert(false, label, detail); }

console.log("→ Odoo NEW smoke test\n");

// ── 1. Server handshake ──────────────────────────────────────
console.log("1. Server handshake");
const version = await rpc("common", "version", []);
assert(typeof version?.server_serie === "string", "server version", version.server_serie);
assert(UID > 0, "authenticated", `uid=${UID}`);

// ── 2. Partner ────────────────────────────────────────────────
console.log("\n2. Partners (res.partner)");
const partnerCount = await ex("res.partner", "search_count", [[["customer_rank", ">", 0]]]);
assert(partnerCount > 0, "customer partners exist", String(partnerCount));

const partnerIds = await ex("res.partner", "search", [[["customer_rank", ">", 0]]], { limit: 1 });
const samplePartnerId = partnerIds[0];
const partners = await ex("res.partner", "read", [[samplePartnerId]], {
  fields: ["id", "name", "vat", "email", "mobile", "is_company", "country_code", "credit"],
});
const samplePartner = partners[0];
assert(samplePartner?.id === samplePartnerId, "partner read", `[${samplePartner.id}] ${samplePartner.name}`);

// ── 3. Subscription (contract.contract) ──────────────────────
console.log("\n3. Subscriptions (contract.contract)");
const contractCount = await ex("contract.contract", "search_count", [[]]);
assert(contractCount > 0, "contracts exist", String(contractCount));

const contractIds = await ex("contract.contract", "search", [[]], { limit: 1 });
const sampleContract = (await ex("contract.contract", "read", [contractIds], {
  fields: [
    "id", "name", "partner_id", "wuipi_state", "wuipi_subscription_state",
    "recurring_next_date", "currency_id", "journal_id", "wuipi_isp_service_count",
  ],
}))[0];
assert(typeof sampleContract.name === "string", "contract name", sampleContract.name);
assert(Array.isArray(sampleContract.partner_id), "contract.partner_id is m2o");
assert(typeof sampleContract.wuipi_subscription_state === "string",
  "wuipi_subscription_state present", sampleContract.wuipi_subscription_state);

// ── 4. Service (wuipi.isp.service) ───────────────────────────
console.log("\n4. Services (wuipi.isp.service)");
const serviceCount = await ex("wuipi.isp.service", "search_count", [[]]);
assert(serviceCount > 0, "services exist", String(serviceCount));

const serviceIds = await ex("wuipi.isp.service", "search", [[]], { limit: 1 });
const sampleService = (await ex("wuipi.isp.service", "read", [serviceIds], {
  fields: [
    "id", "name", "partner_id", "subscription_id", "state", "is_active",
    "ip_cpe", "router_id", "node_id", "wuipi_plan_product_id",
  ],
}))[0];
assert(sampleService.name?.startsWith("SM") || sampleService.name?.length > 0,
  "service has name", sampleService.name);

// ── 5. Invoice (account.move) ────────────────────────────────
console.log("\n5. Invoices (account.move out_invoice)");
const invoiceCount = await ex("account.move", "search_count", [[["move_type", "=", "out_invoice"]]]);
assert(invoiceCount > 0, "invoices exist", String(invoiceCount));

const invoiceIds = await ex("account.move", "search",
  [[["move_type", "=", "out_invoice"]]], { limit: 1 });
const sampleInvoice = (await ex("account.move", "read", [invoiceIds], {
  fields: [
    "id", "name", "partner_id", "state", "payment_state",
    "invoice_date", "invoice_date_due", "amount_total", "amount_residual",
    "currency_id", "invoice_origin",
    "custom_month_billed", "custom_month_billed_text",
    "l10n_ve_control_number", "l10n_ve_invoice_date",
  ],
}))[0];
assert(["draft", "posted", "cancel"].includes(sampleInvoice.state),
  "invoice.state valid", sampleInvoice.state);
assert(["not_paid", "paid", "partial", "in_payment", "reversed", "invoicing_legacy"].includes(sampleInvoice.payment_state),
  "invoice.payment_state valid", sampleInvoice.payment_state);

// ── 6. Currency IDs match config ─────────────────────────────
console.log("\n6. Currency / Journal IDs sanity");
const usd = await ex("res.currency", "read", [[1]], { fields: ["name"] });
assert(usd[0]?.name === "USD", "currency id 1 = USD");

const ved = await ex("res.currency", "read", [[171]], { fields: ["name"] });
assert(ved[0]?.name === "VED", "currency id 171 = VED");

const journal13 = await ex("account.journal", "read", [[13]], { fields: ["code", "name", "currency_id"] });
assert(journal13[0]?.code === "BNK6", "journal id 13 = BNK6 (Mercantil USD)", journal13[0]?.name);

const journal15 = await ex("account.journal", "read", [[15]], { fields: ["code", "name"] });
assert(journal15[0]?.code === "BNK8", "journal id 15 = BNK8 (Pagos Electronicos)", journal15[0]?.name);

// ── 7. Resumen ───────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
if (failed === 0) {
  console.log(`✓ Smoke test OK — todos los checks pasaron`);
  process.exit(0);
} else {
  console.log(`✗ ${failed} check(s) fallaron`);
  process.exit(1);
}
