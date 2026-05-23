#!/usr/bin/env node
// ============================================================
// Discovery #2 — Contract / Subscription model deep-dive
// ============================================================

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
const REPORT_PATH = resolve("MIGRATION-DISCOVERY-CONTRACTS.md");

let rpcId = 1;
async function rpc(service, method, args, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "call", params: { service, method, args } }),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (data.error) {
      const msg = data.error.data?.message || data.error.message;
      throw new Error(`${service}.${method}: ${msg}`);
    }
    return data.result;
  } finally { clearTimeout(t); }
}
const UID = await rpc("common", "authenticate", [DB, USER, KEY, {}]);
async function ex(model, method, args = [], kwargs = {}) {
  return rpc("object", "execute_kw", [DB, UID, KEY, model, method, args, kwargs]);
}

// ── 1. Find contract-like models ─────────────────────────────
console.log("→ scanning models with 'contract' in name...");
const contractModels = await ex("ir.model", "search_read",
  [[["model", "=like", "contract%"]]],
  { fields: ["id", "model", "name", "transient", "modules"], limit: 50, order: "model" });

console.log("→ scanning models created by Wuipi subscription modules...");
const wuipiSubModels = await ex("ir.model", "search_read",
  [["|", ["modules", "ilike", "wuipi_subscription"], ["modules", "ilike", "wuipi_billing"]]],
  { fields: ["id", "model", "name", "modules"], limit: 50, order: "model" });

// ── 2. Inspect contract.contract specifically ────────────────
console.log("→ inspecting contract.contract fields...");
let contractFields = [];
let contractCount = 0;
let contractSample = null;
try {
  contractCount = await ex("contract.contract", "search_count", [[]]);
  contractFields = await ex("ir.model.fields", "search_read",
    [[["model", "=", "contract.contract"]]],
    { fields: ["name", "field_description", "ttype", "required", "relation", "modules"], limit: 300, order: "name" });
  if (contractCount > 0) {
    const ids = await ex("contract.contract", "search", [[]], { limit: 1 });
    if (ids.length > 0) {
      const samples = await ex("contract.contract", "read", [ids], {});
      contractSample = samples[0];
    }
  }
} catch (e) {
  contractFields = [{ error: e.message }];
}

// ── 3. Inspect contract.line ─────────────────────────────────
console.log("→ inspecting contract line model...");
let lineFields = [];
let lineCount = 0;
let lineSample = null;
const lineModelGuesses = ["contract.line", "contract.contract.line"];
let lineModel = null;
for (const candidate of lineModelGuesses) {
  try {
    lineCount = await ex(candidate, "search_count", [[]]);
    lineModel = candidate;
    lineFields = await ex("ir.model.fields", "search_read",
      [[["model", "=", candidate]]],
      { fields: ["name", "field_description", "ttype", "required", "relation", "modules"], limit: 300, order: "name" });
    if (lineCount > 0) {
      const ids = await ex(candidate, "search", [[]], { limit: 1 });
      if (ids.length > 0) lineSample = (await ex(candidate, "read", [ids], {}))[0];
    }
    break;
  } catch (e) { /* try next */ }
}

// ── 4. Custom fields added by Wuipi modules ──────────────────
console.log("→ custom fields by Wuipi modules in res.partner...");
const partnerWuipiFields = await ex("ir.model.fields", "search_read",
  [[["model", "=", "res.partner"], ["modules", "ilike", "wuipi"]]],
  { fields: ["name", "field_description", "ttype", "relation", "modules"], limit: 100, order: "name" });

console.log("→ custom fields by Wuipi modules in account.move...");
const moveWuipiFields = await ex("ir.model.fields", "search_read",
  [[["model", "=", "account.move"], ["modules", "ilike", "wuipi"]]],
  { fields: ["name", "field_description", "ttype", "relation", "modules"], limit: 100, order: "name" });

console.log("→ custom fields by Wuipi modules in contract.contract...");
const contractWuipiFields = await ex("ir.model.fields", "search_read",
  [[["model", "=", "contract.contract"], ["modules", "ilike", "wuipi"]]],
  { fields: ["name", "field_description", "ttype", "relation", "modules"], limit: 100, order: "name" });

// ── 5. Sample partner with contracts ─────────────────────────
console.log("→ looking for partners with contracts...");
let partnerWithContract = null;
if (contractCount > 0 && contractSample) {
  const partnerId = Array.isArray(contractSample.partner_id) ? contractSample.partner_id[0] : null;
  if (partnerId) {
    const partners = await ex("res.partner", "read", [[partnerId]], {
      fields: ["id", "name", "vat", "mobile", "email", "is_company", "customer_rank", "country_id"]
    });
    partnerWithContract = partners[0];
  }
}

// ── 6. Recurring/invoice fields (cron de billing) ────────────
console.log("→ scanning for recurring-related fields in contract.contract...");
const recurringFields = contractFields.filter(f =>
  !f.error && /recur|next|invoice|date_start|date_end|period|generate/i.test(`${f.name} ${f.field_description}`)
);

// ── 7. Check what wuipi_billing exposes (cron rules) ─────────
console.log("→ inspecting cron jobs from Wuipi modules...");
let crons = [];
try {
  crons = await ex("ir.cron", "search_read",
    [[]],
    { fields: ["id", "name", "model_id", "active", "interval_number", "interval_type", "code"], limit: 50 });
} catch (e) {
  crons = [{ error: e.message }];
}
const wuipiCrons = crons.filter(c => !c.error && /wuipi|contract|recur|invoice/i.test(c.name || ""));

// ── Render report ────────────────────────────────────────────
function fieldRow(f) {
  return `| \`${f.name}\` | ${f.field_description} | ${f.ttype}${f.relation ? ` → \`${f.relation}\`` : ""} | ${f.required ? "✓" : ""} | ${f.modules || "—"} |`;
}

function sampleBlock(obj, fields) {
  if (!obj) return "_(sin sample)_";
  const lines = fields
    .filter(f => obj[f] !== undefined)
    .slice(0, 40)
    .map(f => {
      let v = obj[f];
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number") v = `[${v[0]}] ${v[1]}`;
      else if (Array.isArray(v)) v = `[${v.length} items]`;
      else if (typeof v === "string" && v.length > 80) v = v.slice(0, 80) + "…";
      return `  ${f}: ${JSON.stringify(v)}`;
    });
  return "```\n" + lines.join("\n") + "\n```";
}

const md = `# Discovery #2 — Contracts / Subscriptions
> Generado: ${new Date().toISOString()}
> Solo lectura.

## 1. Modelos con \`contract\` en el nombre

${contractModels.length === 0 ? "_Ninguno._" : "| Modelo | Nombre | Transient | Módulos |\n|---|---|---|---|\n" + contractModels.map(m => `| \`${m.model}\` | ${m.name} | ${m.transient} | ${m.modules || "—"} |`).join("\n")}

## 2. Modelos creados por módulos Wuipi (subscription / billing)

${wuipiSubModels.length === 0 ? "_Ninguno._" : "| Modelo | Nombre | Módulos |\n|---|---|---|\n" + wuipiSubModels.map(m => `| \`${m.model}\` | ${m.name} | ${m.modules} |`).join("\n")}

## 3. \`contract.contract\` — modelo principal

- **Count**: ${contractCount} registros existentes
- **Total de fields**: ${contractFields.filter(f => !f.error).length}
- **Sample partner asociado**: ${partnerWithContract ? `\`[${partnerWithContract.id}] ${partnerWithContract.name}\` (VAT: \`${partnerWithContract.vat}\`, mobile: \`${partnerWithContract.mobile}\`)` : "_(ninguno)_"}

### Fields agregados por módulos Wuipi a \`contract.contract\` (${contractWuipiFields.length})

${contractWuipiFields.length === 0 ? "_Ninguno (sólo usa fields del OCA contract)._" : "| Campo | Descripción | Tipo | Required | Módulo |\n|---|---|---|---|---|\n" + contractWuipiFields.map(fieldRow).join("\n")}

### Fields relacionados con recurrencia / facturación (${recurringFields.length})

${recurringFields.length === 0 ? "_Ninguno detectado._" : "| Campo | Descripción | Tipo | Required | Módulo |\n|---|---|---|---|---|\n" + recurringFields.map(fieldRow).join("\n")}

### Todos los fields de \`contract.contract\` (${contractFields.filter(f => !f.error).length})

<details>
<summary>Expandir lista completa</summary>

${contractFields.filter(f => !f.error).map(fieldRow).join("\n").length > 0
  ? "| Campo | Descripción | Tipo | Required | Módulo |\n|---|---|---|---|---|\n" + contractFields.filter(f => !f.error).map(fieldRow).join("\n")
  : "_Vacío o error._"}

</details>

### Sample real (primer contract en la DB)

${contractSample ? sampleBlock(contractSample, [
  "id","name","code","partner_id","invoice_partner_id","pricelist_id","payment_term_id",
  "company_id","journal_id","fiscal_position_id","currency_id",
  "date_start","date_end","recurring_next_date","recurring_interval","recurring_rule_type",
  "recurring_invoicing_type","is_terminated","contract_type","line_recurrence",
  "amount_total","contract_template_id","group_id","note","state"
]) : "_(sin sample)_"}

## 4. Líneas de contrato

- **Modelo detectado**: \`${lineModel || "no encontrado"}\`
- **Count**: ${lineCount}

### Fields (${lineFields.filter(f => !f.error).length})

${lineFields.length === 0 || lineFields[0]?.error
  ? "_Sin fields o modelo no existe._"
  : "<details>\n<summary>Expandir</summary>\n\n| Campo | Descripción | Tipo | Required | Módulo |\n|---|---|---|---|---|\n" + lineFields.filter(f => !f.error).map(fieldRow).join("\n") + "\n\n</details>"}

### Sample (primera línea)

${lineSample ? sampleBlock(lineSample, [
  "id","contract_id","name","product_id","quantity","price_unit","price_subtotal",
  "recurring_next_date","recurring_invoicing_type","recurring_rule_type",
  "recurring_interval","date_start","date_end","is_canceled","display_type","sequence"
]) : "_(sin sample)_"}

## 5. Custom fields Wuipi en \`res.partner\` (${partnerWuipiFields.length})

${partnerWuipiFields.length === 0 ? "_Ninguno._" : "| Campo | Descripción | Tipo | Módulo |\n|---|---|---|---|\n" + partnerWuipiFields.map(f => `| \`${f.name}\` | ${f.field_description} | ${f.ttype}${f.relation ? ` → \`${f.relation}\`` : ""} | ${f.modules} |`).join("\n")}

## 6. Custom fields Wuipi en \`account.move\` (${moveWuipiFields.length})

${moveWuipiFields.length === 0 ? "_Ninguno._" : "| Campo | Descripción | Tipo | Módulo |\n|---|---|---|---|\n" + moveWuipiFields.map(f => `| \`${f.name}\` | ${f.field_description} | ${f.ttype}${f.relation ? ` → \`${f.relation}\`` : ""} | ${f.modules} |`).join("\n")}

## 7. Cron jobs relevantes (billing / contract)

${wuipiCrons.length === 0 ? "_Ninguno._" : "| ID | Nombre | Modelo | Activo | Cada |\n|---|---|---|---|---|\n" + wuipiCrons.map(c => `| ${c.id} | ${c.name} | ${c.model_id ? c.model_id[1] : "—"} | ${c.active ? "✓" : "✗"} | ${c.interval_number} ${c.interval_type} |`).join("\n")}

---

## Análisis preliminar

${(() => {
  const parts = [];
  if (contractCount === 0) parts.push("- ⚠️ Hay 0 contracts. La data está vacía. Si el seed esperado debería tener contracts, hay que cargarlos antes de avanzar.");
  else parts.push(`- ✓ Hay **${contractCount} contracts** en el sistema.`);

  if (contractWuipiFields.length === 0) parts.push("- ⚠️ Wuipi NO agregó campos custom a \`contract.contract\`. Es el modelo OCA puro.");
  else parts.push(`- ✓ Wuipi agregó **${contractWuipiFields.length} campos** a \`contract.contract\`.`);

  const hasRecurringNextDate = contractFields.some(f => !f.error && f.name === "recurring_next_date");
  parts.push(`- ${hasRecurringNextDate ? "✓" : "✗"} \`contract.contract.recurring_next_date\` ${hasRecurringNextDate ? "existe" : "NO existe"}.`);

  if (partnerWuipiFields.length === 0) parts.push("- ⚠️ Ningún campo custom Wuipi en \`res.partner\` (mobile / vat son standard de Odoo, no custom).");
  else parts.push(`- ✓ ${partnerWuipiFields.length} fields custom en \`res.partner\`.`);

  if (moveWuipiFields.length === 0) parts.push("- ⚠️ Ningún campo custom Wuipi en \`account.move\`. \`custom_month_billed\` del viejo NO existe aquí — hay que ver cómo se llama el equivalente o si la lógica se movió a otro lado.");
  else parts.push(`- ✓ ${moveWuipiFields.length} fields custom en \`account.move\`.`);

  return parts.join("\n");
})()}

## Próximas decisiones

1. **Lectura humana del sample de contract** — confirmá si los campos clave (recurring_next_date, partner_id, invoice_partner_id, journal_id, state) coinciden con lo que esperás.
2. **\`month_billed\`** — en el Odoo viejo era \`custom_month_billed\` en account.move. Acá no aparece. ¿Cómo se calcula/almacena en el nuevo? ¿Lo derivamos del contract en lugar de la invoice?
3. **Identificador de suscripción** — \`code\` o \`name\` del contract. Ver sample.
`;

writeFileSync(REPORT_PATH, md, "utf8");
console.log(`\n✓ Reporte: ${REPORT_PATH}`);
console.log(`  ${contractCount} contracts · ${contractFields.filter(f=>!f.error).length} fields · ${contractWuipiFields.length} custom Wuipi`);
