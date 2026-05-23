#!/usr/bin/env node
// Discovery #3 — wuipi.isp.service, subscription states, payment.transaction
import { readFileSync, writeFileSync } from "node:fs";
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
const REPORT_PATH = resolve("MIGRATION-DISCOVERY-SERVICES.md");

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
const ex = (model, method, args = [], kwargs = {}) => rpc("object", "execute_kw", [DB, UID, KEY, model, method, args, kwargs]);

function fmtSample(obj, fields) {
  if (!obj) return "_(sin sample)_";
  return "```\n" + fields.filter(f => obj[f] !== undefined).slice(0, 50).map(f => {
    let v = obj[f];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number") v = `[${v[0]}] ${v[1]}`;
    else if (Array.isArray(v)) v = `[${v.length} items]`;
    else if (typeof v === "string" && v.length > 100) v = v.slice(0, 100) + "…";
    return `  ${f}: ${JSON.stringify(v)}`;
  }).join("\n") + "\n```";
}

async function inspectModel(model, sampleFields = null) {
  try {
    const count = await ex(model, "search_count", [[]]);
    const fg = await ex(model, "fields_get", [], { attributes: ["string", "type", "required", "relation", "selection"] });
    let sample = null;
    if (count > 0) {
      const ids = await ex(model, "search", [[]], { limit: 1 });
      if (ids.length) sample = (await ex(model, "read", [ids], {}))[0];
    }
    return { count, fields: fg, sample };
  } catch (e) {
    return { error: e.message };
  }
}

// ── 1. Subscription state values ─────────────────────────────
console.log("→ selection values for wuipi_subscription_state & wuipi_state...");
const contractFg = await ex("contract.contract", "fields_get",
  [["wuipi_subscription_state", "wuipi_state"]],
  { attributes: ["string", "type", "selection"] });

// ── 2. wuipi.isp.service ─────────────────────────────────────
console.log("→ wuipi.isp.service...");
const ispService = await inspectModel("wuipi.isp.service");

// ── 3. wuipi.payment.promise ─────────────────────────────────
console.log("→ wuipi.payment.promise...");
const paymentPromise = await inspectModel("wuipi.payment.promise");

// ── 4. wuipi.isp.suspension.log ──────────────────────────────
console.log("→ wuipi.isp.suspension.log...");
const suspLog = await inspectModel("wuipi.isp.suspension.log");

// ── 5. payment.transaction ───────────────────────────────────
console.log("→ payment.transaction...");
const payTx = await inspectModel("payment.transaction");

// ── 6. account.payment custom fields by Wuipi ────────────────
console.log("→ account.payment custom fields by Wuipi...");
const apFields = await ex("ir.model.fields", "search_read",
  [[["model", "=", "account.payment"], ["modules", "ilike", "wuipi"]]],
  { fields: ["name", "field_description", "ttype", "relation", "modules"], limit: 100, order: "name" });

// ── 7. wuipi.isp.* models inventory ──────────────────────────
console.log("→ wuipi.* model inventory...");
const wuipiModels = await ex("ir.model", "search_read",
  [[["model", "=like", "wuipi.%"]]],
  { fields: ["id", "model", "name", "transient", "modules"], limit: 100, order: "model" });

// ── 8. payment.provider — activos ────────────────────────────
console.log("→ payment.provider non-disabled...");
let providers = [];
try {
  providers = await ex("payment.provider", "search_read",
    [[["state", "!=", "disabled"]]],
    { fields: ["id", "code", "name", "state", "company_id"], limit: 50 });
} catch (e) {
  providers = [{ error: e.message }];
}

// ── 9. mail.template relevant to billing/portal ──────────────
console.log("→ mail templates for contract/invoice...");
let templates = [];
try {
  templates = await ex("mail.template", "search_read",
    [["|", ["model", "=", "contract.contract"], ["model", "=", "account.move"]]],
    { fields: ["id", "name", "model", "subject", "active"], limit: 20 });
} catch (e) {
  templates = [{ error: e.message }];
}

// ── Render ───────────────────────────────────────────────────
function selectionTable(field) {
  if (!field?.selection) return "_(no es selection o no devolvió valores)_";
  return "| Value | Label |\n|---|---|\n" + field.selection.map(([v, l]) => `| \`${v}\` | ${l} |`).join("\n");
}

function modelSection(title, info, sampleFields) {
  if (info?.error) return `### ${title}\n> Error: \`${info.error}\``;
  const fieldCount = Object.keys(info.fields || {}).length;
  const customWuipi = Object.entries(info.fields || {}).filter(([_, f]) => f.string && info.fields[_]); // we don't have module info here
  let out = `### ${title}\n\n- Count: **${info.count}**\n- Fields: **${fieldCount}**\n\n`;
  if (info.sample) {
    out += `**Sample**:\n${fmtSample(info.sample, sampleFields)}\n\n`;
  } else {
    out += `_(sin registros para sample)_\n\n`;
  }
  out += `<details><summary>Lista de fields</summary>\n\n| Campo | Tipo | Relation | String |\n|---|---|---|---|\n` +
    Object.entries(info.fields || {}).slice(0, 80).map(([name, f]) =>
      `| \`${name}\` | ${f.type} | ${f.relation ? `\`${f.relation}\`` : ""} | ${f.string || ""} |`
    ).join("\n") + `\n\n</details>\n`;
  return out;
}

const md = `# Discovery #3 — wuipi.isp.service, states, payment.transaction
> Generado: ${new Date().toISOString()}

## 1. Estados de la suscripción (selection values)

### \`wuipi_subscription_state\`
${selectionTable(contractFg.wuipi_subscription_state)}

### \`wuipi_state\` (WUIPI lifecycle state)
${selectionTable(contractFg.wuipi_state)}

## 2. \`wuipi.isp.service\` — el servicio del cliente (core para portal)

${modelSection("wuipi.isp.service", ispService, [
  "id","name","partner_id","contract_id","contract_line_id","product_id",
  "state","active","ip_address","ip","mac","router_id","mikrotik_id","plan_id",
  "address","city","node_id","installation_date","suspension_date","reactivation_date",
  "billing_status","is_suspended","is_active","price","speed_down","speed_up",
  "create_date","write_date"
])}

## 3. \`wuipi.payment.promise\` — promesas de pago

${modelSection("wuipi.payment.promise", paymentPromise, [
  "id","name","partner_id","contract_id","invoice_id","amount","currency_id",
  "promise_date","due_date","state","is_active","is_expired","notes"
])}

## 4. \`wuipi.isp.suspension.log\` — log de suspensiones

${modelSection("wuipi.isp.suspension.log", suspLog, [
  "id","service_id","partner_id","contract_id","action","reason","date","user_id"
])}

## 5. \`payment.transaction\` — pasarelas nativas Odoo

${modelSection("payment.transaction", payTx, [
  "id","reference","provider_id","provider_code","amount","currency_id",
  "state","partner_id","invoice_ids","payment_id","date","operation",
  "provider_reference","callback_model_id","callback_res_id"
])}

## 6. Custom fields Wuipi en \`account.payment\` (${apFields.length})

${apFields.length === 0
  ? "_Ninguno._"
  : "| Campo | Descripción | Tipo | Relation | Módulo |\n|---|---|---|---|---|\n" + apFields.map(f =>
      `| \`${f.name}\` | ${f.field_description} | ${f.ttype} | ${f.relation || ""} | ${f.modules} |`
    ).join("\n")
}

## 7. Inventario completo de modelos \`wuipi.*\` (${wuipiModels.length})

${wuipiModels.length === 0
  ? "_Ninguno detectado._"
  : "| Modelo | Nombre | Transient | Módulos |\n|---|---|---|---|\n" + wuipiModels.map(m =>
      `| \`${m.model}\` | ${m.name} | ${m.transient} | ${m.modules || "—"} |`
    ).join("\n")
}

## 8. Payment providers activos (no-disabled)

${providers[0]?.error
  ? `> Error: \`${providers[0].error}\``
  : providers.length === 0
    ? "> _Ninguno activo todavía._"
    : "| ID | Code | Name | State |\n|---|---|---|---|\n" + providers.map(p =>
        `| ${p.id} | \`${p.code}\` | ${p.name} | ${p.state} |`
      ).join("\n")
}

## 9. Mail templates relevantes (contract / invoice)

${templates[0]?.error
  ? `> Error: \`${templates[0].error}\``
  : templates.length === 0
    ? "> _Ninguno relevante._"
    : "| ID | Model | Name | Subject | Active |\n|---|---|---|---|---|\n" + templates.map(t =>
        `| ${t.id} | ${t.model} | ${t.name} | ${t.subject || ""} | ${t.active ? "✓" : "✗"} |`
      ).join("\n")
}

---

## Resumen ejecutivo

- **Estados de suscripción** quedan documentados arriba (sección 1).
- **wuipi.isp.service** es el modelo "servicio ISP del cliente" — clave para portal.
- **payment.transaction** es el modelo nativo de Odoo donde quedan registradas las pasarelas — vamos a integrarnos con esto.
- **Modelos wuipi.*** completos: ver tabla arriba para tener mapa completo.
`;

writeFileSync(REPORT_PATH, md, "utf8");
console.log(`\n✓ Reporte: ${REPORT_PATH}`);
console.log(`  ${wuipiModels.length} modelos wuipi.* · ispService.count=${ispService?.count || "?"} · payTx.count=${payTx?.count || "?"}`);
