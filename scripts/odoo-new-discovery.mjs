#!/usr/bin/env node
// ============================================================
// Odoo NEW (VPS Community 18) — discovery script
// Reads OD_NEW_* from .env.local and produces MIGRATION-DISCOVERY.md
// Read-only. Does not touch the legacy Odoo.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(".env.local");
const REPORT_PATH = resolve("MIGRATION-DISCOVERY.md");

function loadEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r\n]+)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const URL = env.ODOO_BASE_URL;
const DB = "wuipi"; // fixed DB name for new Odoo
const USER = env.ODOO_INT_LOGIN;
const KEY = env.ODOO_INT_API_KEY;

if (!URL || !USER || !KEY) {
  console.error("Missing ODOO_BASE_URL / ODOO_INT_LOGIN / ODOO_INT_API_KEY in .env.local");
  process.exit(1);
}

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
  } finally {
    clearTimeout(t);
  }
}

async function execute(model, method, args = [], kwargs = {}) {
  return rpc("object", "execute_kw", [DB, UID, KEY, model, method, args, kwargs]);
}

// ── Authenticate ──────────────────────────────────────────────
console.log("→ authenticate...");
const version = await rpc("common", "version", []);
const UID = await rpc("common", "authenticate", [DB, USER, KEY, {}]);
if (!UID) throw new Error("Authentication failed");
console.log(`  ✓ uid=${UID}, server ${version.server_version}`);

// ── Discovery queries ────────────────────────────────────────
console.log("→ querying modules...");
const modules = await execute("ir.module.module", "search_read",
  [[["state", "=", "installed"]]],
  { fields: ["name", "shortdesc", "author"], limit: 500, order: "name asc" });
console.log(`  ✓ ${modules.length} installed modules`);

console.log("→ querying currencies...");
const currencies = await execute("res.currency", "search_read",
  [[["name", "in", ["VED", "USD", "VES", "EUR"]]]],
  { fields: ["id", "name", "symbol", "active", "rate"] });

console.log("→ querying journals...");
const journals = await execute("account.journal", "search_read",
  [[]],
  { fields: ["id", "name", "code", "type", "currency_id", "bank_account_id"], limit: 100, order: "type, code" });

console.log("→ querying counts...");
const partnerCount = await execute("res.partner", "search_count", [[["customer_rank", ">", 0]]]);
const allPartnerCount = await execute("res.partner", "search_count", [[]]);
const invoiceCount = await execute("account.move", "search_count", [[["move_type", "=", "out_invoice"]]]);
const draftInvCount = await execute("account.move", "search_count", [[["move_type", "=", "out_invoice"], ["state", "=", "draft"]]]);
const postedInvCount = await execute("account.move", "search_count", [[["move_type", "=", "out_invoice"], ["state", "=", "posted"]]]);
const paymentCount = await execute("account.payment", "search_count", [[]]);
const productCount = await execute("product.template", "search_count", [[["sale_ok", "=", true]]]);

console.log("→ scanning for subscription models...");
const subscriptionModels = await execute("ir.model", "search_read",
  [[["model", "=like", "%subscription%"]]],
  { fields: ["id", "model", "name", "transient", "modules"], limit: 50 });

console.log("→ scanning for custom models (x_*)...");
const customModels = await execute("ir.model", "search_read",
  [[["model", "=like", "x_%"]]],
  { fields: ["id", "model", "name", "modules"], limit: 100 });

console.log("→ scanning custom fields on res.partner...");
const partnerCustom = await execute("ir.model.fields", "search_read",
  [[["model", "=", "res.partner"], "|", ["state", "=", "manual"], ["name", "=like", "x_%"]]],
  { fields: ["name", "field_description", "ttype", "required", "modules"], limit: 100, order: "name" });

console.log("→ scanning custom fields on account.move...");
const moveCustom = await execute("ir.model.fields", "search_read",
  [[["model", "=", "account.move"], "|", ["state", "=", "manual"], ["name", "=like", "x_%"]]],
  { fields: ["name", "field_description", "ttype", "required", "modules"], limit: 100, order: "name" });

console.log("→ scanning payment providers...");
let paymentProviders = [];
try {
  paymentProviders = await execute("payment.provider", "search_read",
    [[]],
    { fields: ["id", "code", "name", "state", "company_id"], limit: 50 });
} catch (e) {
  paymentProviders = [{ error: e.message }];
}

console.log("→ scanning sale.order custom fields (if installed)...");
let saleCustom = [];
try {
  saleCustom = await execute("ir.model.fields", "search_read",
    [[["model", "=", "sale.order"], "|", ["state", "=", "manual"], ["name", "=like", "x_%"]]],
    { fields: ["name", "field_description", "ttype"], limit: 50, order: "name" });
} catch (e) {
  saleCustom = [{ error: e.message }];
}

// ── Heuristic: detect Wuipi custom modules ────────────────────
const wuipiModules = modules.filter(m =>
  /wuipi|x_wuipi|isp|subscription|cobranza|recurring/i.test(`${m.name} ${m.shortdesc || ""} ${m.author || ""}`)
);

// ── Heuristic: which model holds subscriptions ────────────────
const candidateSubModels = subscriptionModels.filter(m => !m.transient);

// ── Render report ────────────────────────────────────────────
const md = `# Odoo NUEVO — Discovery Report
> Generado: ${new Date().toISOString()}
> Server: \`${URL}\` · DB: \`${DB}\` · User: \`${USER}\` (uid=${UID})
> Solo lectura. Sin escritura. Sin tocar Odoo viejo.

## 1. Server

| | |
|---|---|
| Versión | \`${version.server_version}\` (\`${version.server_serie}\`) |
| Build | \`${version.server_version_info?.join(".") || "n/a"}\` |
| UID autenticado | \`${UID}\` |
| Protocolo | \`${version.protocol_version}\` |

## 2. Inventario de datos (counts)

| Modelo | Total |
|---|---:|
| \`res.partner\` (todos) | ${allPartnerCount.toLocaleString()} |
| \`res.partner\` (customer_rank > 0) | ${partnerCount.toLocaleString()} |
| \`account.move\` (out_invoice total) | ${invoiceCount.toLocaleString()} |
| \`account.move\` (out_invoice draft) | ${draftInvCount.toLocaleString()} |
| \`account.move\` (out_invoice posted) | ${postedInvCount.toLocaleString()} |
| \`account.payment\` (total) | ${paymentCount.toLocaleString()} |
| \`product.template\` (sale_ok) | ${productCount.toLocaleString()} |

${partnerCount === 0 ? "> ⚠️ **Odoo todavía vacío** — sin partners de cliente. Esperado si todavía no migraste datos." : "> ✓ Hay datos cargados."}

## 3. Currencies relevantes

| ID | Name | Symbol | Active | Rate |
|---|---|---|---|---|
${currencies.length === 0 ? "| _(ninguna de VED/USD/VES/EUR encontrada)_ | | | | |" : currencies.map(c => `| ${c.id} | ${c.name} | ${c.symbol} | ${c.active} | ${c.rate} |`).join("\n")}

> Comparar con Odoo viejo: \`VED=166, USD=1\` (de memoria). En el nuevo **los IDs serán distintos** — hay que mapear en el cliente.

## 4. Journals (diarios bancarios + pasarelas)

Total: **${journals.length}**

| ID | Code | Name | Type | Currency |
|---|---|---|---|---|
${journals.map(j => `| ${j.id} | \`${j.code}\` | ${j.name} | ${j.type} | ${j.currency_id ? j.currency_id[1] : "—"} |`).join("\n")}

> En el viejo había 12 journals (Mercantil Bs/USD/EUR, Banesco, BdV, BNC, Tesoro, Cash, BNK1-8). Hay que comparar 1 a 1 con el nuevo.

## 5. Modelos de SUSCRIPCIÓN detectados

${candidateSubModels.length === 0
  ? "> ⚠️ **No se detectó ningún modelo con \"subscription\" en el nombre**. Si el módulo custom usa otro naming (ej. \`wuipi.service\`, \`x_contract\`), decime cómo se llama. Si todavía no instalaste el módulo de suscripciones, ese es el siguiente paso antes de seguir."
  : candidateSubModels.map(m => `- \`${m.model}\` — ${m.name}${m.modules ? ` (módulo: \`${m.modules}\`)` : ""}`).join("\n")
}

## 6. Modelos custom (prefijo \`x_*\`)

${customModels.length === 0
  ? "> _Ninguno detectado._"
  : customModels.map(m => `- \`${m.model}\` — ${m.name}${m.modules ? ` (módulo: \`${m.modules}\`)` : ""}`).join("\n")
}

## 7. Custom fields en \`res.partner\`

${partnerCustom.length === 0
  ? "> _Ninguno detectado._ (En el viejo había varios: \`vat\` con cedula sin prefijo, \`mobile\` con formato \"58 414-XXX\", etc.)"
  : "| Campo | Descripción | Tipo | Required | Módulo |\n|---|---|---|---|---|\n" + partnerCustom.map(f => `| \`${f.name}\` | ${f.field_description} | ${f.ttype} | ${f.required} | ${f.modules || "—"} |`).join("\n")
}

## 8. Custom fields en \`account.move\`

${moveCustom.length === 0
  ? "> _Ninguno detectado._ (En el viejo había \`custom_month_billed\`, etc.)"
  : "| Campo | Descripción | Tipo | Required | Módulo |\n|---|---|---|---|---|\n" + moveCustom.map(f => `| \`${f.name}\` | ${f.field_description} | ${f.ttype} | ${f.required} | ${f.modules || "—"} |`).join("\n")
}

## 9. Custom fields en \`sale.order\`

${Array.isArray(saleCustom) && saleCustom[0]?.error
  ? `> Error: \`${saleCustom[0].error}\` (¿módulo \`sale\` no instalado?)`
  : saleCustom.length === 0
    ? "> _Ninguno detectado._"
    : "| Campo | Descripción | Tipo |\n|---|---|---|\n" + saleCustom.map(f => `| \`${f.name}\` | ${f.field_description} | ${f.ttype} |`).join("\n")
}

## 10. Payment providers (pasarelas)

${paymentProviders[0]?.error
  ? `> Error: \`${paymentProviders[0].error}\``
  : paymentProviders.length === 0
    ? "> _Ningún provider configurado todavía._"
    : "| ID | Code | Name | State |\n|---|---|---|---|\n" + paymentProviders.map(p => `| ${p.id} | \`${p.code}\` | ${p.name} | ${p.state} |`).join("\n")
}

## 11. Módulos relevantes Wuipi/ISP (heurística)

${wuipiModules.length === 0
  ? "> _Ninguno detectado con keywords: wuipi, isp, subscription, cobranza, recurring._"
  : wuipiModules.map(m => `- \`${m.name}\` — ${m.shortdesc || "(sin descripción)"}${m.author ? ` · author: ${m.author}` : ""}`).join("\n")
}

## 12. Lista completa de módulos instalados (${modules.length})

<details>
<summary>Expandir lista completa</summary>

${modules.map(m => `- \`${m.name}\` — ${m.shortdesc || ""}`).join("\n")}

</details>

---

## Próximas decisiones a cerrar (orden sugerido)

1. **Nombre del modelo de suscripciones custom** — ${candidateSubModels.length === 0 ? "⚠️ NO detectado automáticamente. Confirmar cómo se llama o instalar primero." : `confirmar cuál de [${candidateSubModels.map(m => `\`${m.model}\``).join(", ")}] es el correcto.`}
2. **Campos clave de la suscripción** — equivalentes a: \`partner_id\`, \`recurring_next_date\`, \`state\` (in_progress/closed), \`recurring_total\`, \`pricelist_id\`, \`code\`/identificador.
3. **Mapeo de currencies** — anotar IDs del nuevo (VED=${currencies.find(c => c.name === "VED")?.id || "?"}, USD=${currencies.find(c => c.name === "USD")?.id || "?"}) y refactorizar hardcodes.
4. **Mapeo de journals** — para cada journal del viejo (Mercantil Bs/USD/EUR, Stripe, PayPal, BNK1-8…), identificar el ID equivalente en el nuevo.
5. **Custom fields a portar** — si en el viejo dependemos de \`custom_month_billed\`, \`x_wuipi_*\`, etc. y no están en el nuevo, hay que crearlos antes del switch o cambiar la lógica.
6. **Tax IDs** — IVA / IGTF / ISLR del viejo vs nuevo (no scanneado todavía; se hace en discovery 2 si querés).

## Cómo seguimos

- Si el modelo de suscripciones aparece arriba: lo abro y mapeo campos en el siguiente paso.
- Si NO aparece y el módulo todavía no está instalado: pausamos discovery hasta que esté.
- Si hay módulos custom Wuipi instalados: te los listo arriba y vemos cuáles dependen.
`;

writeFileSync(REPORT_PATH, md, "utf8");
console.log(`\n✓ Reporte escrito a ${REPORT_PATH}`);
console.log(`  ${modules.length} módulos · ${currencies.length} currencies · ${journals.length} journals · ${candidateSubModels.length} candidatos a subscription`);
