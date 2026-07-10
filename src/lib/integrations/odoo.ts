// ============================================================
// Odoo 18 JSON-RPC Integration
// Docs: https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
// ============================================================

import { getJournalDisplayName } from "@/lib/utils/journal-names";

// 2026-06-03: Repuntado al Odoo nuevo (erp.wuipi.net) usando las mismas env
// vars que `odoo-new/client.ts`. Antes este cliente leía ODOO_URL/ODOO_DB/
// ODOO_USER/ODOO_API_KEY que apuntaban a un Odoo SaaS abandonado
// (wuipitech.odoo.com), mientras que los endpoints de pago (que crean los
// collection_items) ya hablaban con erp.wuipi.net. El resultado: los IDs de
// factura que guardamos eran del nuevo, pero el sync intentaba postearlos en
// el viejo → ~$4K USD en transacciones desencajadas (39 en cola + 87
// huérfanos al 2026-06-03). PAYMENT_METHOD_MAPPING (línea ~921) ya estaba
// actualizado con IDs del nuevo desde 2026-05-23, solo faltaba esto.
//
// Las env vars viejas (ODOO_URL/ODOO_DB/ODOO_USER/ODOO_API_KEY) pueden
// borrarse de Vercel después de validar este deploy.
const ODOO_URL = process.env.ODOO_BASE_URL || "";
const ODOO_DB = "wuipi";
const ODOO_USER = process.env.ODOO_INT_LOGIN || "";
const ODOO_API_KEY = process.env.ODOO_INT_API_KEY || "";

const TIMEOUT_MS = 15_000;
const TIMEOUT_MS_LONG = 60_000;  // operaciones pesadas: action_post, action_create_payments, etc.

// Cached uid — revalidated every hour
let cachedUid: number | null = null;
let cachedUidAt = 0;
const UID_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Helpers ──────────────────────────────────────────────────

export function isOdooConfigured(): boolean {
  return !!(ODOO_URL && ODOO_DB && ODOO_USER && ODOO_API_KEY);
}

/**
 * Sanitize a user-supplied search string before it reaches an Odoo `ilike` domain.
 *
 * - Caps length (prevents sending multi-MB payloads through XML-RPC).
 * - Strips control characters and SQL-LIKE wildcards (%, _) so the caller
 *   controls the match semantics, not the user.
 * - Collapses whitespace.
 *
 * NOTE: Odoo's `ilike` runs as Postgres `ILIKE` with `%` bracketing done by the
 * ORM. User-supplied `%` or `_` inside the value are the only wildcards that
 * reach the DB — we strip them to keep matches predictable and prevent
 * adversarial "give me everything" queries.
 */
export function sanitizeOdooSearch(value: unknown, maxLen = 80): string {
  if (value == null) return "";
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string; data: { message: string } };
}

async function jsonRpc(service: "common" | "object", method: string, args: any[], timeoutMs: number = TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${ODOO_URL}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "call",
        params: { service, method, args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Odoo HTTP ${res.status}: ${res.statusText}`);
    }

    const data: JsonRpcResponse = await res.json();

    if (data.error) {
      const msg = data.error.data?.message || data.error.message;
      throw new Error(`Odoo RPC error: ${msg}`);
    }

    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

// ── Authentication ───────────────────────────────────────────

export async function authenticate(): Promise<number> {
  const now = Date.now();
  if (cachedUid && now - cachedUidAt < UID_TTL_MS) {
    return cachedUid;
  }

  const uid = await jsonRpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);

  if (!uid || typeof uid !== "number") {
    throw new Error("Odoo authentication failed — invalid uid");
  }

  cachedUid = uid;
  cachedUidAt = now;
  return uid;
}

// ── CRUD via execute_kw ──────────────────────────────────────

type OdooDomain = Array<string | number | boolean | string[] | number[]> | string; // string for "|", "&" operators

interface SearchReadOptions {
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
}

export async function searchRead(
  model: string,
  domain: OdooDomain[],
  options: SearchReadOptions = {}
): Promise<any[]> {
  const uid = await authenticate();
  const kwargs: Record<string, any> = {};
  if (options.fields) kwargs.fields = options.fields;
  if (options.limit) kwargs.limit = options.limit;
  if (options.offset !== undefined) kwargs.offset = options.offset;
  if (options.order) kwargs.order = options.order;

  return jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, "search_read",
    [domain],
    kwargs,
  ]);
}

export async function searchCount(
  model: string,
  domain: OdooDomain[]
): Promise<number> {
  const uid = await authenticate();
  return jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, "search_count",
    [domain],
    {},
  ]);
}

export async function read(
  model: string,
  ids: number[],
  fields?: string[]
): Promise<any[]> {
  const uid = await authenticate();
  const kwargs: Record<string, any> = {};
  if (fields) kwargs.fields = fields;

  return jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, "read",
    [ids],
    kwargs,
  ]);
}

// ── Invoice-specific helpers ─────────────────────────────────

const INVOICE_FIELDS = [
  "name",             // Numero de factura (INV/2026/0001)
  "partner_id",       // [id, nombre] del cliente
  "invoice_date",     // Fecha de factura
  "invoice_date_due", // Fecha de vencimiento
  "amount_total",     // Total
  "amount_residual",  // Monto pendiente
  "amount_tax",       // Impuestos
  "amount_untaxed",   // Subtotal
  "currency_id",      // [id, nombre] de la moneda
  "payment_state",    // Estado de pago
  "state",            // Estado del documento
] as const;

const PARTNER_FIELDS = [
  "name",
  "email",
  "mobile",
  "phone",
  "vat",              // RIF/Cedula
  "credit",           // Receivable balance (negative = client has credit in favor)
  "is_company",       // True para personas jurídicas
  "city",             // Para filtros geográficos
] as const;


// ── Helpers genericos write / action_post ─────────────────────

/**
 * Genera un `write()` en Odoo: actualiza campos de un record.
 * Devuelve true si fue exitoso. Lanza si falla.
 */
export async function odooWrite(
  model: string,
  ids: number[],
  vals: Record<string, unknown>
): Promise<boolean> {
  const uid = await authenticate();
  return jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, "write",
    [ids, vals],
    {},
  ]);
}

/**
 * Crea un nuevo record en Odoo. Devuelve el id.
 */
export async function odooCreate(
  model: string,
  vals: Record<string, unknown>
): Promise<number> {
  const uid = await authenticate();
  return jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, "create",
    [vals],
    {},
  ]);
}

/**
 * Llama un metodo arbitrario sobre uno o mas records (ej. action_post).
 * Devuelve lo que el metodo devuelva (varia por metodo).
 *
 * Para metodos pesados (action_post, action_create_payments, etc.) se usa
 * timeout largo (60s) automaticamente. El default es 15s.
 */
export async function odooCallMethod(
  model: string,
  ids: number[],
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<any> {
  const uid = await authenticate();
  // Heuristica: metodos action_* suelen ser operaciones pesadas
  const timeout = method.startsWith("action_") ? TIMEOUT_MS_LONG : TIMEOUT_MS;
  return jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    model, method,
    [ids, ...args],
    kwargs,
  ], timeout);
}

// ── Tipos ─────────────────────────────────────────────────────

export interface UsdRate {
  rate: number;          // res.currency.rate (ej. 0.0020567857991281)
  bsPerUsd: number;      // 1 / rate (ej. 486.1955)
  date: string;          // ISO date (today)
}

export interface DraftInvoiceForSync {
  id: number;
  name: string | false;
  partner_id: [number, string];
  partner_name: string;
  state: "draft" | "posted" | "cancel";
  currency_id: [number, string];
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  amount_residual: number;
  invoice_date_due: string | false;
  invoice_origin: string | false;
}

export interface InvoiceLineForSync {
  id: number;
  name: string;
  product_id: [number, string] | false;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  price_total: number;
  currency_id: [number, string];
  tax_ids: number[];
  account_id: [number, string];
}

export interface PreviewResult {
  ok: boolean;
  invoice: DraftInvoiceForSync;
  lines: InvoiceLineForSync[];
  rate: UsdRate;
  /** "convert": factura draft USD -> postear en VES (multiplica precios por bsPerUsd).
   *  "skip-conversion": factura ya en VED draft, solo postear (caso reentrada).
   *  "usd-no-convert": pago entra en USD (Stripe/PayPal/Cash USD), factura
   *    se postea en USD sin tocar moneda ni precios. */
  scenario: "convert" | "skip-conversion" | "usd-no-convert";
  conversion: {
    line_id: number;
    product: string;
    price_unit_usd: number;
    price_unit_ves: number;
    price_subtotal_usd: number;
    price_subtotal_ves: number;
  }[];
  totals: {
    untaxed_usd: number;
    untaxed_ves: number;
    tax_usd: number;
    tax_ves: number;
    total_usd: number;
    total_ves: number;
  };
  /** Mes calculado para `month_billed` (ej. "Mayo"). null si no se pudo determinar. */
  month_billed: string | null;
  /** Subscription origen leida (puede ser null si no se encontro) */
  subscription: { id: number; name: string; next_invoice_date: string | false } | null;
  validations: {
    invoice_exists: boolean;
    invoice_is_draft: boolean;
    rate_is_valid: boolean;
    has_lines: boolean;
    month_billed_resolved: boolean;
  };
  warnings: string[];
}

export interface PostResult {
  ok: boolean;
  invoice_id: number;
  invoice_name: string | false;          // numero asignado tras posting
  partner_id: number;
  amount_ves: number;
  bcv_rate: number;
  errors?: string[];
}

// ── Funciones de lectura para sync ────────────────────────────

/**
 * Lee una suscripcion (sale.order) por su `name` (ej. "S20548").
 * Usado para encontrar la suscripcion origen de una factura draft via
 * `account.move.invoice_origin`.
 *
 * NOTA: subscription_plan_id NO existe en sale.order — esta solo en
 * sale.order.line. Por eso pedimos solo los campos que si existen.
 */
export async function getSubscriptionByName(name: string): Promise<{
  id: number;
  name: string;
  next_invoice_date: string | false;
} | null> {
  // Odoo NUEVO: suscripciones son contract.contract (no sale.order).
  // El campo equivalente a next_invoice_date es recurring_next_date.
  const list = await searchRead("contract.contract",
    [["name", "=", name]],
    {
      fields: ["id", "name", "recurring_next_date"],
      limit: 1,
    }
  );
  if (!list[0]) return null;
  const c = list[0];
  return {
    id: c.id,
    name: c.name,
    next_invoice_date: c.recurring_next_date,
  };
}

/**
 * Fallback usado cuando una factura draft NO trae `invoice_origin` (caso real:
 * facturas creadas manualmente en Odoo o por flujos prorrateados que no
 * heredan el origin de la suscripción).
 *
 * Devuelve la única suscripción ACTIVA del partner si hay UNA sola con
 * `subscription_state=3_progress` (en curso) y `next_invoice_date` populado.
 * Si hay 0 o >1, devuelve null (mantener el fallo del sync para no asumir mal).
 */
export async function findActiveSubscriptionForPartner(partnerId: number): Promise<{
  id: number;
  name: string;
  next_invoice_date: string | false;
} | null> {
  // Odoo NUEVO: contract.contract con wuipi_subscription_state='3_progress'.
  const list = await searchRead("contract.contract",
    [
      ["partner_id", "=", partnerId],
      ["wuipi_subscription_state", "=", "3_progress"],
    ],
    {
      fields: ["id", "name", "recurring_next_date"],
      limit: 5,
    }
  );
  // Solo confiamos cuando es UNÍVOCA.
  const withDate = list.filter((c: { recurring_next_date: string | false }) =>
    typeof c.recurring_next_date === "string" && c.recurring_next_date
  );
  if (withDate.length !== 1) return null;
  return {
    id: withDate[0].id,
    name: withDate[0].name,
    next_invoice_date: withDate[0].recurring_next_date,
  };
}

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

/**
 * Calcula el campo `month_billed` (texto del mes en español) para una factura
 * de suscripción mensual de Wuipi, usando la `invoice_date_due` de la factura
 * individual.
 *
 * Modelo de facturación Wuipi (validado contra producción 2026-05-14):
 *  - Las facturas se generan ~1 mes antes del periodo de servicio.
 *  - `invoice_date_due` marca el COMIENZO del periodo cubierto.
 *  - El periodo es `[due, due + 1 mes - 1 día]`.
 *  - `month_billed` es el nombre del mes del MIDPOINT del periodo.
 *
 * Ejemplos validados contra el `name` de la línea de producto en Odoo:
 *   due=2026-04-27 → periodo 27-04→26-05 → midpoint mayo 11 → "Mayo"
 *   due=2026-03-27 → periodo 27-03→26-04 → midpoint abril 11 → "Abril"
 *   due=2026-01-28 → periodo 28-01→27-02 → midpoint feb 12 → "Febrero"
 *
 * Ventaja sobre el enfoque previo (next_invoice_date de la suscripción): usa
 * la fecha INDIVIDUAL de cada factura, así un cliente con 3 drafts atrasadas
 * recibe 3 meses distintos en lugar del mismo mes para todas (bug del flujo
 * multi-factura descubierto al implementar el sync correcto el 2026-05-14).
 */
export function computeMonthBilled(invoiceDueDate: string): string {
  const start = new Date(invoiceDueDate + "T12:00:00Z");
  if (Number.isNaN(start.getTime())) return "";

  // periodo cubierto = [due, due + 1 mes - 1 día]
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() - 1);

  // midpoint del periodo
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);

  return MESES_ES[midpoint.getUTCMonth()];
}

/**
 * Fallback histórico: calcula `month_billed` desde `next_invoice_date` de la
 * suscripción cuando la factura no trae `invoice_date_due`. Asume que la draft
 * cubre el periodo `[next - 1 mes, next - 1 día]` (el ciclo previo al próximo).
 *
 * Solo se usa cuando `invoice_date_due` viene vacío (caso raro). Para drafts
 * normales, usar `computeMonthBilled(invoice.invoice_date_due)` directo.
 */
export function computeMonthBilledFromSubscription(nextInvoiceDate: string): string {
  const next = new Date(nextInvoiceDate + "T12:00:00Z");
  if (Number.isNaN(next.getTime())) return "";

  const periodEnd = new Date(next);
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);

  const periodStart = new Date(periodEnd);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
  periodStart.setUTCDate(periodStart.getUTCDate() + 1);

  const midpoint = new Date((periodStart.getTime() + periodEnd.getTime()) / 2);

  return MESES_ES[midpoint.getUTCMonth()];
}

/**
 * Lee la tasa USD live desde res.currency. Esta es la tasa que Odoo aplica
 * cuando algo se postea hoy. Equivale a 1 / (Bs por USD).
 *
 * Ejemplo: si rate=0.0020567 → 1 USD = 486.19 Bs.
 */
export async function getLatestUsdRate(): Promise<UsdRate> {
  const usdList = await searchRead("res.currency",
    [["name", "=", "USD"]],
    { fields: ["id", "name", "rate", "active"], limit: 1 }
  );
  const usd = usdList[0];
  if (!usd) throw new Error("[OdooSync] No se encontro la moneda USD");
  if (!usd.active) throw new Error("[OdooSync] La moneda USD esta desactivada en Odoo");
  if (typeof usd.rate !== "number" || usd.rate <= 0) {
    throw new Error(`[OdooSync] Rate USD invalida: ${usd.rate}`);
  }
  return {
    rate: usd.rate,
    bsPerUsd: 1 / usd.rate,
    date: new Date().toISOString().split("T")[0],
  };
}

/**
 * Lee una factura por ID con todos los campos relevantes para el sync.
 */
export async function getInvoiceById(invoiceId: number): Promise<DraftInvoiceForSync | null> {
  const list = await searchRead("account.move",
    [["id", "=", invoiceId]],
    {
      fields: [
        "id", "name", "partner_id", "state", "currency_id",
        "amount_total", "amount_untaxed", "amount_tax", "amount_residual",
        "invoice_date_due", "invoice_origin",
      ],
      limit: 1,
    }
  );
  if (!list[0]) return null;
  const inv = list[0];
  return {
    id: inv.id,
    name: inv.name,
    partner_id: inv.partner_id,
    partner_name: inv.partner_id?.[1] || "",
    state: inv.state,
    currency_id: inv.currency_id,
    amount_total: inv.amount_total,
    amount_untaxed: inv.amount_untaxed,
    amount_tax: inv.amount_tax,
    amount_residual: inv.amount_residual,
    invoice_date_due: inv.invoice_date_due,
    invoice_origin: inv.invoice_origin,
  };
}

/**
 * Lee las lineas de producto de una factura. Solo display_type='product'
 * (excluye lineas de seccion/nota).
 */
export async function getInvoiceLines(invoiceId: number): Promise<InvoiceLineForSync[]> {
  return searchRead("account.move.line",
    [["move_id", "=", invoiceId], ["display_type", "=", "product"]],
    {
      fields: [
        "id", "name", "product_id", "quantity", "price_unit",
        "price_subtotal", "price_total", "currency_id", "tax_ids", "account_id",
      ],
      limit: 100,
    }
  );
}

/**
 * Genera el preview de un posting: lee factura, lineas, tasa, suscripcion
 * origen y calcula todo lo que se va a hacer. NO toca Odoo.
 *
 * Maneja 3 escenarios:
 *  - "convert" (default si paymentMethod no se pasa): factura draft USD ->
 *    convertir a VES y postear
 *  - "skip-conversion": factura ya en VED (reentrada despues de revertir
 *    desde posted) -> solo llenar month_billed y postear
 *  - "usd-no-convert": paymentMethod cuyo mapping.currencyId === 1 (USD)
 *    -> postear factura en USD sin conversion (Stripe/PayPal/Cash USD)
 *
 * @param paymentMethod opcional. Si se pasa y el mapping tiene currencyId=USD,
 *                      no se convierte la factura. Sin paymentMethod default
 *                      a convert (compat con llamadas Sprint 1).
 */
export async function previewInvoicePosting(
  invoiceId: number,
  paymentMethod?: string,
): Promise<PreviewResult> {
  const invoice = await getInvoiceById(invoiceId);
  const warnings: string[] = [];
  const validations = {
    invoice_exists: !!invoice,
    invoice_is_draft: invoice?.state === "draft",
    rate_is_valid: false,
    has_lines: false,
    month_billed_resolved: false,
  };

  if (!invoice) {
    return {
      ok: false,
      invoice: {} as DraftInvoiceForSync,
      lines: [],
      rate: {} as UsdRate,
      scenario: "convert",
      conversion: [],
      totals: {} as PreviewResult["totals"],
      month_billed: null,
      subscription: null,
      validations,
      warnings: ["Factura no encontrada"],
    };
  }

  if (invoice.state !== "draft") {
    warnings.push(`La factura esta en estado "${invoice.state}", no draft. No se puede postear.`);
  }

  // Detectar escenario:
  //  1. Si paymentMethod indica factura en USD -> "usd-no-convert" (factura debe quedar en USD)
  //  2. Si la factura ya esta en VED -> "skip-conversion" (reentrada)
  //  3. Si la factura esta en USD y debe convertirse a VES -> "convert"
  //
  // OJO: usa `invoiceCurrencyId` (la moneda final de la factura), NO el alias
  // viejo `currencyId` que ahora es la moneda del PAYMENT. Para Stripe/PayPal:
  //   invoiceCurrencyId=166 (factura VES) + paymentCurrencyId=1 (payment USD).
  const currentCurrencyName = invoice.currency_id?.[1];
  const mappingForMethod = paymentMethod ? PAYMENT_METHOD_MAPPING[paymentMethod] : undefined;
  const targetCurrencyId = mappingForMethod?.invoiceCurrencyId ?? mappingForMethod?.currencyId;
  const wantsUsdTarget = targetCurrencyId === 1;

  let scenario: "convert" | "skip-conversion" | "usd-no-convert";
  if (wantsUsdTarget) {
    scenario = "usd-no-convert";
    if (currentCurrencyName !== "USD") {
      warnings.push(`Pago en USD (${paymentMethod}) pero factura esta en ${currentCurrencyName}. La factura debe permanecer en USD para este metodo. Aborta.`);
    }
  } else if (currentCurrencyName === "VED") {
    scenario = "skip-conversion";
  } else {
    scenario = "convert";
    if (currentCurrencyName !== "USD") {
      warnings.push(`La factura esta en ${currentCurrencyName}, esperamos USD o VED. Aborta.`);
    }
  }

  const lines = await getInvoiceLines(invoiceId);
  validations.has_lines = lines.length > 0;
  if (lines.length === 0) warnings.push("La factura no tiene lineas de producto");

  const rate = await getLatestUsdRate();
  validations.rate_is_valid = rate.bsPerUsd > 0;

  // Calcular conversion linea por linea segun scenario:
  // - convert: precio actual es USD -> multiplicar por bsPerUsd para mostrar VES
  // - skip-conversion: precio actual ya es VES -> deducir USD via division
  // - usd-no-convert: precio actual es USD, va a quedar en USD (mostrar conversion VES solo informativo)
  const conversion = lines.map(line => {
    let price_unit_usd: number;
    let price_unit_ves: number;
    let price_subtotal_usd: number;
    let price_subtotal_ves: number;

    if (scenario === "skip-conversion") {
      price_unit_usd = round4(line.price_unit / rate.bsPerUsd);
      price_unit_ves = line.price_unit;
      price_subtotal_usd = round2(line.price_subtotal / rate.bsPerUsd);
      price_subtotal_ves = line.price_subtotal;
    } else {
      // convert o usd-no-convert: precio actual es USD
      price_unit_usd = line.price_unit;
      price_unit_ves = round4(line.price_unit * rate.bsPerUsd);
      price_subtotal_usd = line.price_subtotal;
      price_subtotal_ves = round2(line.price_subtotal * rate.bsPerUsd);
    }

    return {
      line_id: line.id,
      product: Array.isArray(line.product_id) ? line.product_id[1] : line.name,
      price_unit_usd,
      price_unit_ves,
      price_subtotal_usd,
      price_subtotal_ves,
    };
  });

  const totals = scenario === "skip-conversion" ? {
    untaxed_usd: round2(invoice.amount_untaxed / rate.bsPerUsd),
    untaxed_ves: invoice.amount_untaxed,
    tax_usd: round2(invoice.amount_tax / rate.bsPerUsd),
    tax_ves: invoice.amount_tax,
    total_usd: round2(invoice.amount_total / rate.bsPerUsd),
    total_ves: invoice.amount_total,
  } : {
    untaxed_usd: invoice.amount_untaxed,
    untaxed_ves: round2(invoice.amount_untaxed * rate.bsPerUsd),
    tax_usd: invoice.amount_tax,
    tax_ves: round2(invoice.amount_tax * rate.bsPerUsd),
    total_usd: invoice.amount_total,
    total_ves: round2(invoice.amount_total * rate.bsPerUsd),
  };

  // Resolver month_billed.
  // Estrategia (en orden de preferencia):
  //  1) PRINCIPAL — invoice.invoice_date_due → computeMonthBilled directo.
  //     Es el dato MÁS PRECISO porque corresponde al periodo de ESTA factura.
  //     Crítico para clientes morosos con multi-draft de meses distintos: cada
  //     factura recibe su propio mes (no el mismo para todas como hacía la
  //     versión vieja basada en next_invoice_date de la suscripción).
  //  2) Fallback A — sub.next_invoice_date via invoice_origin (si due vacío).
  //  3) Fallback B — sub.next_invoice_date via única suscripción activa del
  //     partner (cubre facturas creadas manualmente sin invoice_origin).
  //     Si hay varias subs activas, no asumimos.
  //
  // Subscription se sigue resolviendo (cuando posible) para trazabilidad y
  // para los fallbacks. NO se requiere para el cálculo cuando invoice_date_due
  // está presente.
  let subscription: PreviewResult["subscription"] = null;
  let month_billed: string | null = null;
  let resolvedVia: "due" | "origin" | "partner_fallback" | null = null;

  // Resolver subscription para trazabilidad (best-effort, no bloqueante)
  if (typeof invoice.invoice_origin === "string" && invoice.invoice_origin) {
    const sub = await getSubscriptionByName(invoice.invoice_origin);
    if (sub) {
      subscription = { id: sub.id, name: sub.name, next_invoice_date: sub.next_invoice_date };
    }
  }
  if (!subscription) {
    const partnerId = invoice.partner_id?.[0];
    if (partnerId) {
      const fallbackSub = await findActiveSubscriptionForPartner(partnerId);
      if (fallbackSub) {
        subscription = { id: fallbackSub.id, name: fallbackSub.name, next_invoice_date: fallbackSub.next_invoice_date };
      }
    }
  }

  // 1) PRINCIPAL: usar invoice_date_due de la factura
  if (typeof invoice.invoice_date_due === "string" && invoice.invoice_date_due) {
    month_billed = computeMonthBilled(invoice.invoice_date_due) || null;
    if (month_billed) resolvedVia = "due";
  }

  // 2) FALLBACK: derivar desde sub.next_invoice_date (cálculo viejo)
  if (!month_billed && subscription && typeof subscription.next_invoice_date === "string" && subscription.next_invoice_date) {
    month_billed = computeMonthBilledFromSubscription(subscription.next_invoice_date) || null;
    if (month_billed) {
      // Si llegamos acá es porque la factura no tenía invoice_date_due —
      // distinguimos si la subscription vino del origin o del partner_fallback
      // por si hay que diagnosticar.
      resolvedVia = invoice.invoice_origin ? "origin" : "partner_fallback";
    }
  }

  validations.month_billed_resolved = !!month_billed;
  if (!month_billed) {
    warnings.push("No se pudo resolver month_billed (sin invoice_date_due ni suscripcion con next_invoice_date) — sin esto el action_post puede quedarse silenciosamente en draft");
  } else if (resolvedVia !== "due") {
    // El cálculo PRECISO usa invoice_date_due. Si caímos al fallback de
    // suscripción, dejá traza para detectar drafts mal configuradas.
    console.warn(`[OdooSync] month_billed=${month_billed} resuelto via fallback ${resolvedVia} para invoice ${invoiceId} — esperabamos invoice_date_due`);
  }

  const ok = validations.invoice_exists && validations.invoice_is_draft &&
             validations.rate_is_valid && validations.has_lines &&
             validations.month_billed_resolved && warnings.length === 0;

  return { ok, invoice, lines, rate, scenario, conversion, totals, month_billed, subscription, validations, warnings };
}

/**
 * POSTING REAL — modifica Odoo. Usar solo tras validar dry-run.
 *
 * Flujo segun scenario (lo decide previewInvoicePosting basado en paymentMethod):
 *   - convert: cambiar currency a VED + recalcular precios + month_billed + action_post
 *   - skip-conversion: solo month_billed + action_post (factura ya en VED)
 *   - usd-no-convert: solo month_billed + action_post (factura queda en USD)
 *
 * @param paymentMethod opcional. Si presente y mapping.currencyId=USD, no convierte.
 */
export async function postInvoiceInVes(
  invoiceId: number,
  paymentMethod?: string,
): Promise<PostResult> {
  const errors: string[] = [];
  const preview = await previewInvoicePosting(invoiceId, paymentMethod);
  if (!preview.ok) {
    return {
      ok: false,
      invoice_id: invoiceId,
      invoice_name: false,
      partner_id: 0,
      amount_ves: 0,
      bcv_rate: 0,
      errors: ["Preview no valido: " + preview.warnings.join("; ")],
    };
  }

  const partnerId = preview.invoice.partner_id?.[0] || 0;

  try {
    // 1. Solo si scenario=convert: cambiar moneda USD->VED y recalcular precios
    if (preview.scenario === "convert") {
      const vedList = await searchRead("res.currency",
        [["name", "=", "VED"]], { fields: ["id"], limit: 1 }
      );
      if (!vedList[0]) {
        return {
          ok: false, invoice_id: invoiceId, invoice_name: false, partner_id: partnerId,
          amount_ves: 0, bcv_rate: preview.rate.bsPerUsd,
          errors: ["No se encontro la moneda VED en Odoo"],
        };
      }
      const vedId = vedList[0].id;

      await odooWrite("account.move", [invoiceId], { currency_id: vedId });
      for (const line of preview.lines) {
        const newPriceUnit = round4(line.price_unit * preview.rate.bsPerUsd);
        await odooWrite("account.move.line", [line.id], { price_unit: newPriceUnit });
      }
    }
    // skip-conversion: factura ya en VED por posting previo revertido. NO tocar.
    // usd-no-convert: pago en USD (Stripe/PayPal/Cash USD). Factura queda en USD,
    //                 no se toca moneda ni precios.

    // 2. Escribir month_billed (CRITICO)
    if (!preview.month_billed) {
      return {
        ok: false, invoice_id: invoiceId, invoice_name: false, partner_id: partnerId,
        amount_ves: 0, bcv_rate: preview.rate.bsPerUsd,
        errors: ["month_billed no resuelto — abort para no quedar silenciosamente en draft"],
      };
    }
    // Odoo NUEVO (módulo wuipi_unidigital):
    // - custom_month_billed: boolean (toggle)
    // - custom_month_billed_text: char (texto "Junio", "Julio", ...)
    // En el Odoo viejo el campo era `month_billed`. Renombrado en el módulo SENIAT del nuevo.
    await odooWrite("account.move", [invoiceId], {
      custom_month_billed: true,
      custom_month_billed_text: preview.month_billed,
    });

    // 3. action_post
    await odooCallMethod("account.move", [invoiceId], "action_post");

    // 4. Releer state — verificar que efectivamente se posteo
    const after = await getInvoiceById(invoiceId);
    if (!after) {
      return {
        ok: false, invoice_id: invoiceId, invoice_name: false, partner_id: partnerId,
        amount_ves: 0, bcv_rate: preview.rate.bsPerUsd,
        errors: ["Factura desaparecio tras action_post"],
      };
    }
    if (after.state !== "posted") {
      return {
        ok: false, invoice_id: invoiceId, invoice_name: after.name || false,
        partner_id: partnerId, amount_ves: after.amount_total,
        bcv_rate: preview.rate.bsPerUsd,
        errors: [`action_post no posteo la factura — quedo en state="${after.state}". Validacion de Odoo bloqueo el post (probablemente otro campo custom requerido).`],
      };
    }

    return {
      ok: true,
      invoice_id: invoiceId,
      invoice_name: after.name || false,
      partner_id: partnerId,
      amount_ves: after.amount_total,
      bcv_rate: preview.rate.bsPerUsd,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      invoice_id: invoiceId,
      invoice_name: false,
      partner_id: partnerId,
      amount_ves: 0,
      bcv_rate: preview.rate.bsPerUsd,
      errors,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ============================================================
// PAYMENT REGISTER (Sprint 1) — Crear account.payment + reconciliar
// ============================================================
//
// Tras postear la factura draft USD -> posted VES (postInvoiceInVes), este
// modulo registra el pago en el banco y lo reconcilia con la factura. Solo
// asi la factura queda como paid en Odoo y el cliente deja de ver deuda en
// su portal.
//
// Mapeo metodo de pago -> journal Odoo:

export interface PaymentMethodMapping {
  journalId: number;
  paymentMethodLineId: number;
  /** Moneda en la que va a quedar POSTED la factura (Odoo currency_id). */
  invoiceCurrencyId: number;
  /** Moneda del account.payment que se va a crear (Odoo currency_id). */
  paymentCurrencyId: number;
  /**
   * @deprecated Alias retrocompatible = paymentCurrencyId. Antes era el único
   * campo de moneda; manténgase igual a paymentCurrencyId para no romper
   * callers viejos. Nuevos callers deben usar invoiceCurrencyId/paymentCurrencyId.
   */
  currencyId: number;
  description: string;
}

/**
 * Mapeo de metodo de pago de collection_items -> journal/payment_method_line
 * en Odoo. IDs verificados directamente en Odoo prod (2026-04-30).
 *
 * IMPORTANTE — multimoneda (separado en 2 campos desde 2026-05-13):
 *  - `invoiceCurrencyId`: moneda final de la factura tras postear.
 *      166 (VED) → scenario "convert" (draft USD → posted VES con BCV)
 *      1 (USD)   → scenario "usd-no-convert" (factura permanece USD)
 *  - `paymentCurrencyId`: moneda del account.payment.
 *      Igual a invoiceCurrencyId para métodos en Bs (Mercantil, c2p, etc.)
 *      Distinto para Stripe/PayPal: factura VES + payment USD (FX automático
 *      en el reconcile contra el diario USD 9021).
 */
export const PAYMENT_METHOD_MAPPING: Record<string, PaymentMethodMapping> = {
  // === Odoo NUEVO (erp.wuipi.net) — actualizado 2026-05-23 ===
  // VED currency_id: 171 (era 166 en el viejo)
  // Journals: BNK1=6 (genérico), BNK6=13 (Mercantil USD), BNK8=15 (Pagos Electrónicos USD)
  //           CSH1=7 (Cash genérico), IGTF=19
  // Payment method lines: cada journal tiene solo "Manual Payment" inbound id paris.
  // Stripe/PayPal queda con "Manual Payment" línea — el provider real se identifica
  // por payment_reference y el journal name. Pendiente: crear líneas Stripe/PayPal
  // en BNK8 del Odoo nuevo si querés tracking nativo por payment.method.line.
  debito_inmediato: {
    journalId: 6,                   // BNK1 "Bank" (genérico, acepta VED)
    paymentMethodLineId: 1,         // Manual Payment inbound BNK1
    invoiceCurrencyId: 171,         // VED nuevo
    paymentCurrencyId: 171,
    currencyId: 171,
    description: "Mercantil Bs (BNK1)",
  },
  c2p: {
    journalId: 6,
    paymentMethodLineId: 1,
    invoiceCurrencyId: 171,
    paymentCurrencyId: 171,
    currencyId: 171,
    description: "Mercantil Bs (BNK1) — Pago Movil C2P",
  },
  transferencia: {
    journalId: 6,
    paymentMethodLineId: 1,
    invoiceCurrencyId: 171,
    paymentCurrencyId: 171,
    currencyId: 171,
    description: "Mercantil Bs (BNK1) — Transferencia",
  },
  cash: {                            // Cash en VES
    journalId: 7,                   // CSH1 "Cash" (genérico)
    paymentMethodLineId: 3,         // Manual Payment inbound CSH1
    invoiceCurrencyId: 171,
    paymentCurrencyId: 171,
    currencyId: 171,
    description: "Efectivo Bs",
  },
  cash_ves: {
    journalId: 7,
    paymentMethodLineId: 3,
    invoiceCurrencyId: 171,
    paymentCurrencyId: 171,
    currencyId: 171,
    description: "Efectivo Bs",
  },
  cash_usd: {                        // Cash USD
    journalId: 7,                   // CSH1 (mismo journal, currency override)
    paymentMethodLineId: 3,
    invoiceCurrencyId: 1,           // USD
    paymentCurrencyId: 1,
    currencyId: 1,
    description: "Cash USD",
  },
  stripe: {
    journalId: 15,                  // BNK8 "Pagos Electronicos" (USD)
    paymentMethodLineId: 17,        // Manual Payment inbound BNK8
    invoiceCurrencyId: 171,         // factura en VES
    paymentCurrencyId: 1,           // payment en USD (Stripe nativo)
    currencyId: 1,
    description: "Stripe USD → BNK8 (factura VES)",
  },
  paypal: {
    journalId: 15,
    paymentMethodLineId: 17,
    invoiceCurrencyId: 171,
    paymentCurrencyId: 1,
    currencyId: 1,
    description: "PayPal USD → BNK8 (factura VES)",
  },
};

/**
 * Devuelve true si el método tiene `paymentCurrencyId !== invoiceCurrencyId`,
 * es decir el `account.payment` se crea en moneda distinta a la de la factura
 * (ej. Stripe/PayPal: factura VES + payment USD). Para estos métodos el monto
 * del payment NO puede derivarse de `invoice.amount_total` (que está en VES);
 * hay que pasarle el `amountUsd` explícito al sync.
 *
 * Importancia para multi-factura: cuando un cliente paga N facturas con un solo
 * cobro Stripe/PayPal, el monto total cobrado debe PRORRATEARSE entre las N
 * facturas. Para los métodos misma-moneda esto no aplica — cada factura recibe
 * su `amount_total` exacto.
 */
export function isMultiCurrencyMethod(paymentMethod: string): boolean {
  const mapping = PAYMENT_METHOD_MAPPING[paymentMethod];
  if (!mapping) return false;
  return mapping.paymentCurrencyId !== mapping.invoiceCurrencyId;
}

/**
 * Reparte un monto total cobrado en USD entre N facturas, proporcional al
 * `amount_total` USD de cada factura. Garantiza que la suma de los
 * prorrateados === totalAmountUsd EXACTO (el último item absorbe el delta de
 * redondeo a 2 decimales).
 *
 * Casos:
 *  - 1 factura → devuelve { id: totalAmountUsd } (idempotente con singleton).
 *  - N facturas con `invoiceAmountsUsd` válidos → prorrateo proporcional.
 *  - N facturas pero `invoiceAmountsUsd` vacío/incompleto → split equitativo
 *    `totalAmountUsd / N` (fallback defensivo; loguea warning aparte).
 *
 * NO lanza — el caller debe verificar que `invoiceIds.length > 0` antes.
 */
export function computeProratedAmounts(
  invoiceIds: number[],
  invoiceAmountsUsd: Record<number, number> | null | undefined,
  totalAmountUsd: number,
): Record<number, number> {
  if (invoiceIds.length === 0) return {};
  if (invoiceIds.length === 1) {
    return { [invoiceIds[0]]: round2(totalAmountUsd) };
  }

  // Reunir los amounts conocidos. Sin map o sin todos los amounts → split equitativo.
  const amounts = invoiceAmountsUsd || {};
  const knownAmounts = invoiceIds.map((id) => amounts[id]);
  const allKnown = knownAmounts.every((v) => typeof v === "number" && v > 0);
  const totalKnown = knownAmounts.reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);

  const result: Record<number, number> = {};
  if (!allKnown || totalKnown <= 0) {
    // Fallback equitativo: divide parejo entre todas. Último absorbe delta.
    const equalShare = round2(totalAmountUsd / invoiceIds.length);
    let acc = 0;
    for (let i = 0; i < invoiceIds.length; i++) {
      const id = invoiceIds[i];
      if (i === invoiceIds.length - 1) {
        result[id] = round2(totalAmountUsd - acc);
      } else {
        result[id] = equalShare;
        acc += equalShare;
      }
    }
    return result;
  }

  // Prorrateo proporcional al amount conocido de cada factura.
  let acc = 0;
  for (let i = 0; i < invoiceIds.length; i++) {
    const id = invoiceIds[i];
    if (i === invoiceIds.length - 1) {
      // Último item absorbe el delta para garantizar suma exacta.
      result[id] = round2(totalAmountUsd - acc);
    } else {
      const share = round2((amounts[id] / totalKnown) * totalAmountUsd);
      result[id] = share;
      acc += share;
    }
  }
  return result;
}

export interface PaymentRegisterResult {
  ok: boolean;
  payment_id?: number;
  payment_name?: string;
  payment_state?: string;
  invoice_payment_state_after?: string;
  reconciled: boolean;
  errors?: string[];
}

export interface PaymentRegisterPreview {
  ok: boolean;
  invoice_id: number;
  invoice_state: string;
  invoice_payment_state: string;
  partner_id: number;
  partner_name: string;
  amount: number;
  currency: string;
  mapping: PaymentMethodMapping;
  payment_date: string;
  memo: string;
  validations: {
    invoice_exists: boolean;
    invoice_is_posted: boolean;
    invoice_not_already_paid: boolean;
    mapping_exists: boolean;
  };
  warnings: string[];
}

/**
 * Genera el preview de registrar un pago en Odoo. NO toca Odoo.
 */
export async function previewRegisterPayment(opts: {
  invoiceId: number;
  paymentMethod: string;          // "debito_inmediato" | "c2p" | etc.
  paymentReference: string;       // ref bancaria, ej. "000000031187535"
  paymentToken: string;           // ej. "WPY-E3849DB4"
  paymentDate?: string;           // YYYY-MM-DD, default hoy
}): Promise<PaymentRegisterPreview> {
  const warnings: string[] = [];
  const validations = {
    invoice_exists: false,
    invoice_is_posted: false,
    invoice_not_already_paid: false,
    mapping_exists: false,
  };

  const invoice = await getInvoiceById(opts.invoiceId);
  validations.invoice_exists = !!invoice;
  if (!invoice) {
    return {
      ok: false,
      invoice_id: opts.invoiceId,
      invoice_state: "",
      invoice_payment_state: "",
      partner_id: 0,
      partner_name: "",
      amount: 0,
      currency: "",
      mapping: {} as PaymentMethodMapping,
      payment_date: "",
      memo: "",
      validations,
      warnings: ["Factura no encontrada"],
    };
  }

  // Leer payment_state actual
  const fullInv = (await read("account.move", [opts.invoiceId], ["payment_state", "amount_residual"]))[0];
  const paymentState = fullInv?.payment_state || "not_paid";

  // Monto a registrar = lo que FALTA por pagar (amount_residual) SOLO para las
  // facturas posted-PARCIALES del saldo anterior (residual < total). Un draft
  // recién posteado tiene residual == total → sigue usando amount_total.
  // m4 (review): gateado por el flag para que con flag OFF sea provablemente
  // byte-idéntico (siempre amount_total, preservando el baseline de useRealAmount).
  const residualNow = Math.round(Number(fullInv?.amount_residual ?? 0) * 100) / 100;
  const useResidualAmount =
    process.env.PORTAL_SALDO_ANTERIOR_ENABLED === "true" &&
    invoice.state === "posted" &&
    residualNow > 0.01 &&
    residualNow < invoice.amount_total - 0.01;
  const amountToRegister = useResidualAmount ? residualNow : invoice.amount_total;

  validations.invoice_is_posted = invoice.state === "posted";
  if (invoice.state !== "posted") {
    warnings.push(`Factura esta en state="${invoice.state}", debe estar posted antes de registrar pago`);
  }

  validations.invoice_not_already_paid = paymentState === "not_paid" || paymentState === "partial";
  if (paymentState === "paid" || paymentState === "in_payment") {
    warnings.push(`Factura ya tiene payment_state="${paymentState}" — no es necesario registrar otro pago`);
  }

  const mapping = PAYMENT_METHOD_MAPPING[opts.paymentMethod];
  validations.mapping_exists = !!mapping;
  if (!mapping) {
    warnings.push(`Metodo de pago "${opts.paymentMethod}" no tiene mapeo a journal Odoo. Sprint 1 solo soporta: ${Object.keys(PAYMENT_METHOD_MAPPING).join(", ")}`);
  }

  const paymentDate = opts.paymentDate || new Date().toISOString().split("T")[0];
  // Memo ÚNICO POR FACTURA: sufijo #<invoiceId> pegado al token (sin espacios).
  // El guard de idempotencia de Odoo captura wpy_<hex>(#<suffix>)? y así distingue
  // pago-todo multi-factura del mismo monto exacto (que si no daría falso positivo).
  // También hace nuestra idempotencia exacta por (token, factura), incl. huérfanos.
  // Incidente 2026-07-01.
  const memo = `${opts.paymentToken}#${opts.invoiceId} — Mercantil Web ref:${opts.paymentReference}`;

  const ok = validations.invoice_exists && validations.invoice_is_posted &&
             validations.invoice_not_already_paid && validations.mapping_exists &&
             warnings.length === 0;

  return {
    ok,
    invoice_id: opts.invoiceId,
    invoice_state: invoice.state,
    invoice_payment_state: paymentState,
    partner_id: invoice.partner_id?.[0] || 0,
    partner_name: invoice.partner_id?.[1] || "",
    amount: amountToRegister,
    currency: invoice.currency_id?.[1] || "",
    mapping: mapping || ({} as PaymentMethodMapping),
    payment_date: paymentDate,
    memo,
    validations,
    warnings,
  };
}

// ============================================================
// ANTICIPO (saldo a favor) — incidente 2026-06-30
// Odoo expone 2 métodos en sus módulos wuipi_* (verificados en prod):
//   res.partner.wuipi_get_partner_anticipo(pid)
//       -> { bs, usd, bcv_rate, has_anticipo }
//   account.move.wuipi_apply_anticipo(invId, { amount_bs })
//       -> { success, move_id, amount_applied_bs, residual_after_bs }
// ============================================================

export interface PartnerAnticipo {
  bs: number;
  usd: number;
  bcv_rate: number;
  has_anticipo: boolean;
}

/** Lee el saldo a favor (anticipo, cta 2105007) del partner. Read-only. */
export async function getPartnerAnticipo(partnerId: number): Promise<PartnerAnticipo> {
  const uid = await authenticate();
  const r = (await jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "res.partner", "wuipi_get_partner_anticipo", [[partnerId]],
  ])) as Partial<PartnerAnticipo> | null;
  return {
    bs: Number(r?.bs ?? 0),
    usd: Number(r?.usd ?? 0),
    bcv_rate: Number(r?.bcv_rate ?? 0),
    has_anticipo: !!r?.has_anticipo,
  };
}

/** Aplica `amountBs` del anticipo del partner a la factura (cierra el residuo). */
export async function applyAnticipoToInvoice(
  invoiceId: number,
  amountBs: number,
): Promise<{ success: boolean; move_id?: number; amount_applied_bs: number; residual_after_bs: number }> {
  const uid = await authenticate();
  // amount_bs va como KWARGS (7º arg de execute_kw), NO como dict posicional —
  // sino el método recibe amount_bs = {amount_bs: X} y no aplica (bug 2026-06-30
  // latente, confirmado por el equipo Odoo en el E2E 2026-07-09).
  const r = (await jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "account.move", "wuipi_apply_anticipo",
    [[invoiceId]],
    { amount_bs: amountBs },
  ])) as { success?: boolean; move_id?: number; amount_applied_bs?: number; residual_after_bs?: number } | null;
  return {
    success: !!r?.success,
    move_id: r?.move_id,
    amount_applied_bs: Number(r?.amount_applied_bs ?? 0),
    residual_after_bs: Number(r?.residual_after_bs ?? 0),
  };
}

/**
 * Cobra y cierra el residual de una factura POSTEADA-parcial (saldo anterior) vía
 * el helper Odoo `wuipi_pay_invoice_residual`. Crea+postea+reconcilia el pago
 * ATÓMICO contra ESA factura, SIN pasar por el matching de drafts del hook de
 * action_post (que enrutaría el pago a anticipo). O cierra al 100% o lanza
 * UserError — jsonRpc lo propaga como throw, hay que capturarlo en el caller.
 *
 * `amountBs` omitido/null → paga el residual VIVO completo (no el congelado, evita
 * el stale por cobros de caja intermedios). Solo facturas en Bs. `memo` con el
 * token wpy_ para la idempotencia de reintentos (el helper la respeta).
 * Recomendado por el equipo Odoo (2026-07-09) — reemplaza el flujo "crear payment
 * + reconcile manual", que perdía la carrera contra el hook.
 */
export async function payInvoiceResidual(
  invoiceId: number,
  opts: { memo: string; journalId?: number; amountBs?: number | null },
): Promise<{ success: boolean; payment_id?: number; payment_name?: string; amount_applied_bs: number; residual_after_bs: number }> {
  const uid = await authenticate();
  const kwargs: Record<string, unknown> = { memo: opts.memo };
  if (typeof opts.journalId === "number") kwargs.journal_id = opts.journalId;
  if (typeof opts.amountBs === "number" && opts.amountBs > 0) kwargs.amount_bs = opts.amountBs;
  const r = (await jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "account.move", "wuipi_pay_invoice_residual",
    [[invoiceId]],
    kwargs,
  ])) as { success?: boolean; payment_id?: number; payment_name?: string; amount_applied_bs?: number; residual_after_bs?: number } | null;
  return {
    success: !!r?.success,
    payment_id: r?.payment_id,
    payment_name: r?.payment_name,
    amount_applied_bs: Number(r?.amount_applied_bs ?? 0),
    residual_after_bs: Number(r?.residual_after_bs ?? 0),
  };
}

export interface PayInvoiceResult {
  success: boolean;
  invoiceName?: string;
  invoiceState?: string;
  alreadyPaid: boolean;
  paymentId?: number;
  paymentName?: string;
  amountAppliedBs: number;
  excessToAnticipoBs: number;
  residualAfterBs: number;
}

/**
 * Helper UNIVERSAL de cobro del equipo Odoo (`account.move.wuipi_pay_invoice`,
 * 2026-07-09). Para CUALQUIER factura en Bs (draft o posteada): la postea si es
 * draft (fechas/tasa BCV del día, no seteamos month_billed — es computado),
 * auto-aplica el saldo a favor del partner, y cobra el residual ATÓMICO contra
 * ESA factura — SIN pasar por el matching de drafts del hook de action_post (que
 * desviaba pagos a anticipo en multi-factura, bug Massimo/Gustavo/Emilio 2026-07).
 *
 * `amountBs` omitido → cobra el residual exacto post-anticipo (recomendado; el
 * drift de tasa queda del lado banco, céntimos misma-tasa). Con `amountBs`, si
 * excede el residual el excedente va a anticipo (`excessToAnticipoBs`).
 * Idempotente por memo wpy_ (reintento no duplica). Consume el saldo UNA vez en
 * un loop (los créditos se concilian; la siguiente iteración lee residual fresco).
 * `alreadyPaid=true` (cubierto por saldo / reintento) → sin pago, montos 0.
 * O cierra al 100% o lanza UserError (jsonRpc lo propaga como throw — capturar).
 * Solo Bs (rechaza divisa). Reemplaza registerPayment+reconcile manual y payInvoiceResidual.
 */
export async function payInvoice(
  invoiceId: number,
  opts: { memo: string; journalId?: number; amountBs?: number | null },
): Promise<PayInvoiceResult> {
  const uid = await authenticate();
  const kwargs: Record<string, unknown> = { memo: opts.memo };
  if (typeof opts.journalId === "number") kwargs.journal_id = opts.journalId;
  if (typeof opts.amountBs === "number" && opts.amountBs > 0) kwargs.amount_bs = opts.amountBs;
  const r = (await jsonRpc("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "account.move", "wuipi_pay_invoice",
    [[invoiceId]],
    kwargs,
  ])) as {
    success?: boolean; invoice_name?: string; invoice_state?: string; already_paid?: boolean;
    payment_id?: number; payment_name?: string; amount_applied_bs?: number;
    excess_to_anticipo_bs?: number; residual_after_bs?: number;
  } | null;
  return {
    success: !!r?.success,
    invoiceName: r?.invoice_name,
    invoiceState: r?.invoice_state,
    alreadyPaid: !!r?.already_paid,
    paymentId: r?.payment_id,
    paymentName: r?.payment_name,
    amountAppliedBs: Number(r?.amount_applied_bs ?? 0),
    excessToAnticipoBs: Number(r?.excess_to_anticipo_bs ?? 0),
    residualAfterBs: Number(r?.residual_after_bs ?? 0),
  };
}

/**
 * Idempotencia POR FACTURA: ¿ESTA factura ya tiene un account.payment de ESTE
 * token? El memo nuevo es `${paymentToken}#${invoiceId} — Mercantil Web ref:...`
 * (legacy sin sufijo: `${paymentToken} — ...`).
 * Evita doble-pago en reintentos del cron (crítico con el flujo de anticipo,
 * donde la factura puede quedar parcial y disparar retry).
 *
 * OJO multi-factura: en pago-todo cada factura tiene su PROPIO payment pero
 * TODOS comparten el token. Por eso filtramos por la factura (matched_payment_ids)
 * y NO solo por el token — sino al procesar la 2ª factura encontraríamos el
 * payment de la 1ª y saltaríamos crear el suyo.
 */
export async function findPaymentForInvoiceByToken(
  invoiceId: number,
  paymentToken: string,
): Promise<number | null> {
  if (!paymentToken) return null;
  // IMPORTANTE (bug 2026-07-01): NO usar invoice.matched_payment_ids — en este
  // Odoo 18 viene SIEMPRE vacío aunque el pago esté reconciliado, así que la
  // idempotencia devolvía null y el cron duplicaba pagos (14 pares). Buscamos
  // en account.payment por MEMO (empieza con el token) y filtramos por
  // reconciled_invoice_ids (ESE sí está poblado en el lado payment).
  const pmts = (await searchRead(
    "account.payment",
    [["memo", "like", `${paymentToken}%`]],
    { fields: ["id", "memo", "reconciled_invoice_ids", "state"], limit: 20 },
  )) as Array<{ id: number; memo?: string | false; reconciled_invoice_ids?: number[]; state?: string }>;
  // Excluir cancelados/borrador (un payment cancelado no bloquea el reenvío).
  const active = pmts.filter((p) => p.state !== "cancel" && p.state !== "cancelled" && p.state !== "draft");
  // 1) Formato nuevo (memo `${token}#${invoiceId} — ...`): match EXACTO por
  //    (token, factura). NO depende de la reconciliación → cubre también el
  //    huérfano posteado-no-reconciliado. Vía preferida, a prueba de balas.
  const uniquePrefix = `${paymentToken}#${invoiceId}`;
  const byMemo = active.find(
    (p) => typeof p.memo === "string" && (p.memo === uniquePrefix || p.memo.startsWith(uniquePrefix + " ")),
  );
  if (byMemo) return byMemo.id;
  // 2) Legacy (memo sin sufijo): payment YA reconciliado contra ESTA factura.
  //    V1 (review): descartar el pago de OTRA factura (memo `${token}#<otroId>`)
  //    que el auto-reconcile de Odoo pudo cruzar contra esta — sino, al procesar
  //    el residual, tomaríamos el pago del draft y NO registraríamos el del residual.
  const byRecon = active.find((p) => {
    if (!Array.isArray(p.reconciled_invoice_ids) || !p.reconciled_invoice_ids.includes(invoiceId)) return false;
    if (typeof p.memo === "string" && p.memo.startsWith(`${paymentToken}#`)) {
      const targetId = parseInt(p.memo.slice(`${paymentToken}#`.length), 10);
      if (Number.isInteger(targetId) && targetId !== invoiceId) return false;
    }
    return true;
  });
  if (byRecon) return byRecon.id;
  // 3) Legacy huérfano: único payment del token sin reconciliar (reconcile falló
  //    en un intento previo). Solo si es el único → no cruzar facturas.
  if (active.length === 1) {
    const only = active[0];
    if (!only.reconciled_invoice_ids || only.reconciled_invoice_ids.length === 0) return only.id;
  }
  return null;
}

/**
 * REGISTER REAL — crea el account.payment, lo postea y lo reconcilia con la
 * factura. Approach manual paso a paso (en vez del wizard) porque el wizard
 * action_create_payments en Odoo 18 falla con "Solo puede conciliar los
 * asientos publicados" al hacer reconcile antes de que el move del payment
 * quede posted.
 *
 * Flujo:
 *   1. Crear account.payment (state=draft)
 *   2. action_post sobre el payment → genera move + state=in_process
 *   3. Buscar la linea del move del payment con account=destination (receivable)
 *   4. Buscar la linea del move de la factura con account=destination (receivable)
 *   5. Reconciliar las dos lineas via account.move.line.reconcile()
 *   6. Releer factura para verificar payment_state cambio a paid/in_payment
 */
export async function registerPaymentForInvoice(opts: {
  invoiceId: number;
  paymentMethod: string;
  paymentReference: string;
  paymentToken: string;
  paymentDate?: string;
  /**
   * Monto del pago en USD. Sólo relevante cuando paymentCurrencyId !==
   * invoiceCurrencyId (ej. Stripe/PayPal: factura VES + payment USD).
   * Si la factura y el payment están en la misma moneda, este campo se
   * ignora y se usa `invoice.amount_total`.
   */
  amountUsd?: number | null;
  /**
   * Monto REAL en Bs que el gateway cobró (= lo que entró al banco). Solo se
   * usa en MISMA moneda CUANDO el partner tiene saldo a favor: en ese caso se
   * registra este monto (no invoice.amount_total) y se aplica el anticipo al
   * residuo. Sin anticipo se ignora. Incidente 2026-06-30.
   */
  amountVesPaid?: number | null;
}): Promise<PaymentRegisterResult> {
  const errors: string[] = [];
  const preview = await previewRegisterPayment(opts);
  if (!preview.ok) {
    return {
      ok: false,
      reconciled: false,
      errors: ["Preview no valido: " + preview.warnings.join("; ")],
    };
  }

  try {
    // Idempotencia POR FACTURA: si ESTA factura ya tiene un payment de este
    // token, NO crear otro (reintentos del cron). Por-factura para no romper el
    // pago multi-factura (cada factura tiene su payment con el mismo token).
    // NOTA: solo cubre payments YA reconciliados (matched_payment_ids); un
    // payment posteado-pero-no-reconciliado (fallo de reconcile previo) NO se
    // detecta — ventana de doble-pago pre-existente, no garantía total.
    const existingPaymentId = await findPaymentForInvoiceByToken(opts.invoiceId, opts.paymentToken);
    if (existingPaymentId) {
      // Si la factura quedó PARCIAL (un intento previo registró el monto real
      // pero el applyAnticipo falló transitoriamente), reintentar aplicar el
      // anticipo ahora. NO sellar como 'done' una factura parcial: devolver
      // ok = (factura realmente pagada) para que, si sigue parcial, caiga a
      // revisión manual en vez de quedar como deuda fantasma silenciosa.
      let inv = (await read("account.move", [opts.invoiceId], ["payment_state", "amount_residual"]))[0];
      let residual = round2(Number(inv?.amount_residual || 0));
      if (residual > 0.01) {
        try {
          const a = await getPartnerAnticipo(preview.partner_id);
          if (a.has_anticipo && a.bs > 0.01) {
            await applyAnticipoToInvoice(opts.invoiceId, round2(Math.min(residual, a.bs)));
            inv = (await read("account.move", [opts.invoiceId], ["payment_state", "amount_residual"]))[0];
            residual = round2(Number(inv?.amount_residual || 0));
          }
        } catch (err) {
          console.warn(`[registerPayment] reintento applyAnticipo inv=${opts.invoiceId}:`, err);
        }
      }
      const ps = inv?.payment_state;
      const fullyPaid = ps === "paid" || ps === "in_payment" || residual <= 0.01;
      return {
        ok: fullyPaid,
        payment_id: existingPaymentId,
        invoice_payment_state_after: ps || "unknown",
        reconciled: fullyPaid,
        errors: fullyPaid ? undefined : [`Payment ${existingPaymentId} ya existe pero la factura sigue ${ps} (residual=${residual}) — revisar`],
      };
    }

    // Multimoneda: si paymentCurrency difiere de invoiceCurrency (Stripe/PayPal),
    // el account.payment se crea en la moneda del payment con su propio amount.
    // Si coinciden, payment.amount = invoice.amount_total (comportamiento previo).
    const paymentCurrencyId =
      preview.mapping.paymentCurrencyId ?? preview.mapping.currencyId;
    const invoiceCurrencyId =
      preview.mapping.invoiceCurrencyId ?? preview.mapping.currencyId;
    const isMultiCurrency = paymentCurrencyId !== invoiceCurrencyId;

    // ── NO INFLAR EL BANCO / ANTICIPO — incidente 2026-06-30 ─────────────
    // INVARIANTE: nunca registrar MÁS de lo que entró al banco. Si el gateway
    // cobró MENOS que el total de la factura (amountVesPaid < total) — por saldo
    // a favor, deriva BCV, o anticipo consumido entre el quote y el cobro —
    // registramos el monto REAL cobrado, NO invoice.amount_total. La señal
    // autoritativa es "cobramos de menos", NO que el anticipo siga vigente
    // (evita TOCTOU). Luego, si hay anticipo, lo aplicamos al residuo; si no
    // alcanza (deriva BCV, anticipo consumido), la factura queda parcial y cae
    // a revisión manual — mejor que inflar el banco.
    // Solo factura en VES (cash_usd queda fuera: USD, no compara con Bs).
    // Sin cobrar-de-menos (>99% de casos): IDÉNTICO al previo y NO se llama el
    // helper de Odoo (cero costo extra en el camino feliz).
    const invoiceIsVes = invoiceCurrencyId === 171; // VED nuevo
    const useRealAmount =
      !isMultiCurrency &&
      invoiceIsVes &&
      typeof opts.amountVesPaid === "number" &&
      opts.amountVesPaid > 0 &&
      opts.amountVesPaid < preview.amount - 0.01;

    let anticipo: PartnerAnticipo = { bs: 0, usd: 0, bcv_rate: 0, has_anticipo: false };
    if (useRealAmount) {
      try {
        anticipo = await getPartnerAnticipo(preview.partner_id);
      } catch (err) {
        // Si el helper falla, igual registramos el monto real (no inflar). El
        // residuo quedará sin cubrir → factura parcial → revisión manual.
        console.warn(`[registerPayment] getPartnerAnticipo fallo partner ${preview.partner_id}:`, err);
      }
    }

    const paymentAmount = isMultiCurrency && typeof opts.amountUsd === "number" && opts.amountUsd > 0
      ? opts.amountUsd
      : (useRealAmount ? (opts.amountVesPaid as number) : preview.amount);

    // 1. Crear el account.payment directamente (state inicial = draft)
    const paymentId = await odooCreate("account.payment", {
      payment_type: "inbound",
      partner_type: "customer",
      partner_id: preview.partner_id,
      journal_id: preview.mapping.journalId,
      payment_method_line_id: preview.mapping.paymentMethodLineId,
      amount: paymentAmount,
      currency_id: paymentCurrencyId,
      date: preview.payment_date,
      memo: preview.memo,
    });

    // 2. action_post sobre el payment → genera move y lineas, state=in_process
    await odooCallMethod("account.payment", [paymentId], "action_post");

    // 3. Releer el payment para obtener move_id, destination_account_id, state
    const pmt = (await read("account.payment", [paymentId],
      ["name", "state", "move_id", "destination_account_id"]))[0];
    if (!pmt) {
      throw new Error(`No se pudo releer el payment ${paymentId} tras action_post`);
    }
    const paymentMoveId = pmt.move_id?.[0];
    const destAccountId = pmt.destination_account_id?.[0];
    if (!paymentMoveId || !destAccountId) {
      throw new Error(`Payment ${paymentId} sin move_id o destination_account_id tras action_post`);
    }

    // Verificar que el move quedo posted (sino la reconciliacion fallara)
    const paymentMove = (await read("account.move", [paymentMoveId], ["state"]))[0];
    if (paymentMove?.state !== "posted") {
      throw new Error(`Move del payment ${paymentMoveId} quedo en state="${paymentMove?.state}", esperabamos posted`);
    }

    // En Odoo 18, action_post sobre el payment a veces hace auto-reconciliacion
    // con facturas pendientes del partner. Si ya esta reconciliado, saltarse el
    // reconcile manual (sino tira "asientos ya conciliados").
    const checkInvoice = (await read("account.move", [opts.invoiceId],
      ["payment_state", "amount_residual"]))[0];
    if (checkInvoice?.payment_state === "paid" || checkInvoice?.payment_state === "in_payment") {
      // Ya quedo reconciliada via action_post auto-match — devolver success.
      return {
        ok: true,
        payment_id: paymentId,
        payment_name: pmt.name,
        payment_state: pmt.state,
        invoice_payment_state_after: checkInvoice.payment_state,
        reconciled: true,
      };
    }

    // 4. Buscar las 2 lineas a reconciliar:
    //    a) Del move del payment: la linea de la cuenta receivable (destination)
    //    b) Del move de la factura: la linea de la cuenta receivable (display_type=payment_term)
    const uid = await authenticate();
    const paymentLines = await jsonRpc("object", "execute_kw", [
      ODOO_DB, uid, ODOO_API_KEY,
      "account.move.line", "search_read",
      [[
        ["move_id", "=", paymentMoveId],
        ["account_id", "=", destAccountId],
      ]],
      { fields: ["id", "account_id", "debit", "credit"] },
    ]);
    const invoiceLines = await jsonRpc("object", "execute_kw", [
      ODOO_DB, uid, ODOO_API_KEY,
      "account.move.line", "search_read",
      [[
        ["move_id", "=", opts.invoiceId],
        ["account_id", "=", destAccountId],
        ["display_type", "=", "payment_term"],
      ]],
      { fields: ["id", "account_id", "debit", "credit", "reconciled"] },
    ]);

    if (!paymentLines[0] || !invoiceLines[0]) {
      throw new Error(`No se encontraron lineas para reconciliar (payment_lines=${paymentLines.length}, invoice_lines=${invoiceLines.length})`);
    }

    // 5. Reconciliar las dos lineas
    await odooCallMethod(
      "account.move.line",
      [paymentLines[0].id, invoiceLines[0].id],
      "reconcile"
    );

    // 5b. Cobramos de menos: la factura queda con residuo. Si hay anticipo, lo
    //     aplicamos (cap al disponible). Si NO hay anticipo (deriva BCV, anticipo
    //     consumido), la factura queda PARCIAL a propósito — el verify de abajo
    //     devuelve ok=false → revisión manual (mejor que inflar el banco). NO se
    //     duplica pago en el reintento por la idempotencia por-factura (salvo el
    //     huérfano posteado-no-reconciliado, documentado arriba).
    if (useRealAmount) {
      try {
        const invRes = (await read("account.move", [opts.invoiceId], ["amount_residual"]))[0];
        const residual = round2(Number(invRes?.amount_residual || 0));
        if (residual > 0.01 && anticipo.has_anticipo && anticipo.bs > 0.01) {
          const applyAmt = round2(Math.min(residual, anticipo.bs));
          const ar = await applyAnticipoToInvoice(opts.invoiceId, applyAmt);
          console.log(
            `[registerPayment] anticipo inv=${opts.invoiceId}: pedido=${applyAmt} ` +
            `aplicado=${ar.amount_applied_bs} residual_after=${ar.residual_after_bs} success=${ar.success}`
          );
        }
      } catch (err) {
        console.error(`[registerPayment] applyAnticipo fallo inv=${opts.invoiceId}:`, err);
        // No revertimos el payment; la factura quedará parcial y el item se
        // encolará para revisión manual (sin duplicar pago).
      }
    }

    // 6. Releer factura para verificar payment_state
    const after = (await read("account.move", [opts.invoiceId],
      ["payment_state", "matched_payment_ids", "amount_residual"]))[0];
    const paymentState = after?.payment_state || "unknown";
    const reconciled = paymentState === "paid" || paymentState === "in_payment";

    if (!reconciled) {
      errors.push(`Tras reconcile: invoice.payment_state="${paymentState}", residual=${after?.amount_residual}. Esperabamos paid o in_payment.`);
    }

    return {
      ok: reconciled,
      payment_id: paymentId,
      payment_name: pmt.name,
      payment_state: pmt.state,
      invoice_payment_state_after: paymentState,
      reconciled,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      reconciled: false,
      errors,
    };
  }
}

// ============================================================
// ORQUESTACION (Sprint 2) — sync completo idempotente
// ============================================================

export interface SyncOdooResult {
  ok: boolean;
  post_invoice_done: boolean;
  register_payment_done: boolean;
  post_invoice_result?: PostResult;
  payment_result?: PaymentRegisterResult;
  error?: string;
  invoice_payment_state?: string;
  /** True si el pre-check encontro la factura ya posted+pagada+reconciliada
   *  y skipeo todo el flujo. Usado por el cron para distinguir "estaba ya OK"
   *  de "se sincronizo en este intento". */
  already_synced?: boolean;
}

/**
 * Ejecuta el sync completo de un item a Odoo (postear factura + registrar
 * payment + reconciliar) con idempotencia paso a paso. Si postInvoiceDone
 * es true, salta el primer paso. Si registerPaymentDone es true, salta el
 * segundo. El cron de la cola usa esto para no repetir trabajo en reintentos.
 *
 * Pre-check de idempotencia (a partir de 2026-05-03): antes de ejecutar nada
 * lee el estado actual de la factura. Si esta posted con amount_residual=0 y
 * payment_state in_payment/paid, devuelve ok=true sin tocar nada — el caso
 * tipico de race condition entre 2 webhooks paralelos donde uno gana y el
 * otro encuentra la factura ya finalizada.
 */
export async function syncOdooForCollectionItem(opts: {
  invoiceId: number;
  paymentMethod: string;
  paymentReference: string;
  paymentToken: string;
  paymentDate?: string;
  postInvoiceDone?: boolean;
  registerPaymentDone?: boolean;
  /**
   * Monto del pago en USD. Sólo se usa cuando el mapeo del método tiene
   * paymentCurrencyId !== invoiceCurrencyId (ej. Stripe/PayPal: factura
   * posted en VES, account.payment creado en USD). Si la moneda del pago
   * coincide con la de la factura, este campo se ignora.
   */
  amountUsd?: number | null;
  /** Monto real en Bs cobrado por el gateway (para el flujo de anticipo). */
  amountVesPaid?: number | null;
}): Promise<SyncOdooResult> {
  const result: SyncOdooResult = {
    ok: false,
    post_invoice_done: opts.postInvoiceDone || false,
    register_payment_done: opts.registerPaymentDone || false,
  };

  // Pre-check de idempotencia: si la factura ya esta en estado final,
  // no hay nada que hacer. Cubre el caso de webhooks paralelos donde uno
  // gano la carrera y dejo la factura posted+payment+reconciliada antes
  // de que llegue el segundo intento.
  if (!result.post_invoice_done || !result.register_payment_done) {
    try {
      const current = await read("account.move", [opts.invoiceId],
        ["state", "payment_state", "amount_residual"]);
      const inv = current[0];
      if (inv && inv.state === "posted") {
        const fullyPaid = Number(inv.amount_residual) === 0
          && (inv.payment_state === "paid" || inv.payment_state === "in_payment");
        if (fullyPaid) {
          // Caso ideal: factura posted + reconciliada. No hacer nada.
          return {
            ok: true,
            post_invoice_done: true,
            register_payment_done: true,
            invoice_payment_state: inv.payment_state,
            already_synced: true,
          };
        }
        // Posted pero NO pagada: skip post pero permitir register_payment
        result.post_invoice_done = true;
      }
    } catch (err) {
      // Si el pre-check falla, seguimos al flujo normal — no es bloqueante
      console.warn(`[syncOdoo] Pre-check fallo para invoice ${opts.invoiceId}:`, err);
    }
  }

  if (!result.post_invoice_done) {
    try {
      // Pasamos paymentMethod para que decida si convertir o no (Stripe/PayPal/CashUSD no convierten)
      const postRes = await postInvoiceInVes(opts.invoiceId, opts.paymentMethod);
      result.post_invoice_result = postRes;
      if (!postRes.ok) {
        result.error = `post_invoice failed: ${postRes.errors?.join("; ") || "unknown"}`;
        return result;
      }
      result.post_invoice_done = true;
    } catch (err) {
      result.error = `post_invoice exception: ${err instanceof Error ? err.message : String(err)}`;
      return result;
    }
  }

  if (!result.register_payment_done) {
    try {
      const payRes = await registerPaymentForInvoice({
        invoiceId: opts.invoiceId,
        paymentMethod: opts.paymentMethod,
        paymentReference: opts.paymentReference,
        paymentToken: opts.paymentToken,
        paymentDate: opts.paymentDate,
        amountUsd: opts.amountUsd ?? null,
        amountVesPaid: opts.amountVesPaid ?? null,
      });
      result.payment_result = payRes;
      if (!payRes.ok) {
        result.error = `register_payment failed: ${payRes.errors?.join("; ") || "unknown"}`;
        result.invoice_payment_state = payRes.invoice_payment_state_after;
        return result;
      }
      result.register_payment_done = true;
      result.invoice_payment_state = payRes.invoice_payment_state_after;
    } catch (err) {
      result.error = `register_payment exception: ${err instanceof Error ? err.message : String(err)}`;
      return result;
    }
  }

  result.ok = result.post_invoice_done && result.register_payment_done;
  return result;
}

// ============================================================
// Helpers de lookup (Sprint 4) — para integracion automatica con webhook
// ============================================================

/**
 * Busca un partner en Odoo por cedula/RIF (vat) o email, en ese orden.
 * Devuelve el partner_id o null si no encuentra match.
 */
export async function findOdooPartnerByIdentifiers(opts: {
  vat?: string | null;
  email?: string | null;
}): Promise<number | null> {
  if (opts.vat) {
    // Limpia el VAT: quita guiones, espacios, prefijos "V-" etc.
    const vatClean = opts.vat.replace(/[^A-Za-z0-9]/g, "");
    // Probar variantes comunes (con y sin prefijo V/J/E)
    const variants = [
      vatClean,
      vatClean.toUpperCase(),
      // Si empieza con V/J/E, probar sin la letra
      /^[VJEPGvjepg]/.test(vatClean) ? vatClean.slice(1) : null,
    ].filter(Boolean) as string[];
    for (const v of variants) {
      const found = await searchRead("res.partner",
        [["vat", "=", v]],
        { fields: ["id"], limit: 1 }
      );
      if (found[0]) return found[0].id;
    }
  }
  if (opts.email) {
    const found = await searchRead("res.partner",
      [["email", "=", opts.email.toLowerCase()]],
      { fields: ["id"], limit: 1 }
    );
    if (found[0]) return found[0].id;
  }
  return null;
}

/**
 * Devuelve la factura draft de salida (out_invoice) mas reciente del partner,
 * o null si no hay. Usada para encontrar a que factura aplicar un pago cuando
 * el webhook llega.
 *
 * Si hay varias drafts (caso raro), devuelve la mas reciente por create_date.
 */
export async function findLatestDraftInvoiceForPartner(partnerId: number): Promise<number | null> {
  const list = await searchRead("account.move",
    [
      ["partner_id", "=", partnerId],
      ["state", "=", "draft"],
      ["move_type", "=", "out_invoice"],
    ],
    { fields: ["id"], limit: 1, order: "create_date desc" }
  );
  return list[0]?.id || null;
}
