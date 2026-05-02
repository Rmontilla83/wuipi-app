// ============================================================
// Odoo 18 JSON-RPC Integration
// Docs: https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
// ============================================================

import { getJournalDisplayName } from "@/lib/utils/journal-names";

const ODOO_URL = process.env.ODOO_URL || "";
const ODOO_DB = process.env.ODOO_DB || "";
const ODOO_USER = process.env.ODOO_USER || "";
const ODOO_API_KEY = process.env.ODOO_API_KEY || "";

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
] as const;

export interface OdooInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  odoo_partner_id: number;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_due: number;
  currency: string;
  payment_state: string;
}

/**
 * Fetch pending invoices (accounts receivable) from Odoo.
 * In our workflow: draft invoices = what clients owe (cuentas por cobrar).
 * Posted invoices = already collected revenue.
 * Optional: pass partner name to filter by customer.
 */
export async function getPendingInvoices(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: OdooInvoice[]; total: number }> {
  const domain: OdooDomain[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "draft"],
  ];

  // If searching by customer name, first find matching partners
  let partnerIds: number[] | null = null;
  const safeSearch = sanitizeOdooSearch(options?.search);
  if (safeSearch) {
    const partners = await searchRead("res.partner", [
      ["name", "ilike", safeSearch],
    ], { fields: ["id"], limit: 100 });
    partnerIds = partners.map((p: any) => p.id);

    if (partnerIds.length === 0) {
      return { invoices: [], total: 0 };
    }
    domain.push(["partner_id", "in", partnerIds]);
  }

  // Get total count
  const total = await searchCount("account.move", domain);

  // Get invoices
  const rawInvoices = await searchRead("account.move", domain, {
    fields: [...INVOICE_FIELDS],
    limit: options?.limit || 100,
    offset: options?.offset || 0,
    order: "invoice_date_due asc",
  });

  if (rawInvoices.length === 0) {
    return { invoices: [], total };
  }

  // Get partner details for all unique partner_ids
  const uniquePartnerIds = Array.from(
    new Set(rawInvoices.map((inv: any) => inv.partner_id[0]))
  ) as number[];

  const partners = await read("res.partner", uniquePartnerIds, [...PARTNER_FIELDS]);
  const partnerMap = new Map(partners.map((p: any) => [p.id, p]));

  // Map to our format
  const invoices: OdooInvoice[] = rawInvoices.map((inv: any) => {
    const partner = partnerMap.get(inv.partner_id[0]) || {};
    return {
      id: inv.id,
      invoice_number: inv.name || "",
      customer_name: partner.name || inv.partner_id[1] || "",
      customer_email: partner.email || "",
      customer_phone: partner.mobile || partner.phone || "",
      customer_cedula_rif: partner.vat || "",
      odoo_partner_id: inv.partner_id[0],
      invoice_date: inv.invoice_date || "",
      due_date: inv.invoice_date_due || "",
      subtotal: inv.amount_untaxed || 0,
      tax: inv.amount_tax || 0,
      total: inv.amount_total || 0,
      amount_due: inv.amount_total || 0, // drafts: full amount is owed
      currency: inv.currency_id?.[1] || "USD",
      payment_state: "not_paid", // all drafts are unpaid
    };
  });

  return { invoices, total };
}

// ── Grouped by customer ──────────────────────────────────────

export interface OdooInvoiceDetail {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total: number;
  amount_due: number;
  currency: string;
  payment_state: string;
  products: string[];
  lines: Array<{ product_name: string; quantity: number; price_unit: number; price_subtotal: number; price_total: number }>;
  ref: string;
  payments: Array<{ journal_name: string; amount: number; date: string; ref: string }>;
}

export interface OdooCustomerBalance {
  odoo_partner_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  invoice_count: number;
  total_due: number;       // net debt: drafts - credit_favor (in USD)
  credit_favor_usd: number; // saldo a favor converted to USD (0 if none)
  draft_total_usd: number;  // raw draft total before credit deduction
  currency: string;
  oldest_due_date: string;
  invoices: OdooInvoiceDetail[];
}

/**
 * Fetch pending invoices grouped by customer.
 * Each customer has a total_due and a list of individual invoices with product details.
 */
export async function getPendingByCustomer(options?: {
  search?: string;
  minAmount?: number;
  bcvRate?: number;
}): Promise<{ customers: OdooCustomerBalance[]; total_customers: number; total_due: number }> {
  const rate = options?.bcvRate || 474;
  // Draft invoices = accounts receivable (what clients owe)
  const domain: OdooDomain[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "draft"],
  ];

  const safeSearch = sanitizeOdooSearch(options?.search);
  if (safeSearch) {
    const partners = await searchRead("res.partner", [
      ["name", "ilike", safeSearch],
    ], { fields: ["id"], limit: 200 });
    const pids = partners.map((p: any) => p.id);
    if (pids.length === 0) {
      return { customers: [], total_customers: 0, total_due: 0 };
    }
    domain.push(["partner_id", "in", pids]);
  }

  // Fetch all pending invoices (no limit — need full picture for grouping)
  const rawInvoices = await searchRead("account.move", domain, {
    fields: [...INVOICE_FIELDS],
    limit: 2000,
    order: "partner_id asc, invoice_date_due asc",
  });

  if (rawInvoices.length === 0) {
    return { customers: [], total_customers: 0, total_due: 0 };
  }

  // Get partner details
  const uniquePartnerIds = Array.from(
    new Set(rawInvoices.map((inv: any) => inv.partner_id[0]))
  ) as number[];
  const partners = await read("res.partner", uniquePartnerIds, [...PARTNER_FIELDS]);
  const partnerMap = new Map(partners.map((p: any) => [p.id, p]));

  // Get product details from invoice lines
  const invoiceIds = rawInvoices.map((inv: any) => inv.id);
  const lines = await searchRead("account.move.line", [
    ["move_id", "in", invoiceIds],
    ["display_type", "=", "product"],
  ], {
    fields: ["move_id", "product_id", "name"],
    limit: 5000,
  });

  // Map invoice_id → product names
  const productsByInvoice = new Map<number, string[]>();
  for (const line of lines) {
    const invId = line.move_id[0];
    const productName = line.product_id ? line.product_id[1] : (line.name || "");
    if (!productsByInvoice.has(invId)) productsByInvoice.set(invId, []);
    productsByInvoice.get(invId)!.push(productName);
  }

  // Group by partner
  const grouped = new Map<number, { partner: any; invoices: any[] }>();
  for (const inv of rawInvoices) {
    const pid = inv.partner_id[0];
    if (!grouped.has(pid)) {
      grouped.set(pid, { partner: partnerMap.get(pid) || {}, invoices: [] });
    }
    grouped.get(pid)!.invoices.push(inv);
  }

  // Build result
  let grandTotal = 0;
  const customers: OdooCustomerBalance[] = [];

  for (const [pid, data] of grouped) {
    const p = data.partner;
    let draftTotal = 0;
    let oldestDue = "9999-12-31";
    const currency = data.invoices[0]?.currency_id?.[1] || "USD";

    const invoiceDetails: OdooInvoiceDetail[] = data.invoices.map((inv: any) => {
      draftTotal += inv.amount_total; // drafts: full amount is owed
      if (inv.invoice_date_due && inv.invoice_date_due < oldestDue) {
        oldestDue = inv.invoice_date_due;
      }
      return {
        id: inv.id,
        invoice_number: inv.name || "",
        invoice_date: inv.invoice_date || "",
        due_date: inv.invoice_date_due || "",
        total: inv.amount_total || 0,
        amount_due: inv.amount_total || 0,
        currency: inv.currency_id?.[1] || "USD",
        payment_state: "not_paid",
        products: productsByInvoice.get(inv.id) || [],
        lines: [],
        ref: "",
        payments: [],
      };
    });

    // credit > 0 = owes money (posted unpaid, in VED) → convert to USD and ADD
    // credit < 0 = overpaid (saldo a favor, in VED) → convert to USD and SUBTRACT
    const partnerCredit = p.credit || 0; // VED
    const creditUsd = partnerCredit / rate; // positive = debt, negative = favor
    const netDue = Math.max(draftTotal + creditUsd, 0);

    if (options?.minAmount && netDue < options.minAmount) continue;

    grandTotal += netDue;
    customers.push({
      odoo_partner_id: pid,
      customer_name: p.name || data.invoices[0]?.partner_id[1] || "",
      customer_email: p.email || "",
      customer_phone: p.mobile || p.phone || "",
      customer_cedula_rif: p.vat || "",
      invoice_count: data.invoices.length,
      total_due: Math.round(netDue * 100) / 100,
      credit_favor_usd: Math.round((partnerCredit < 0 ? Math.abs(partnerCredit) / rate : 0) * 100) / 100,
      draft_total_usd: Math.round(draftTotal * 100) / 100,
      currency,
      oldest_due_date: oldestDue === "9999-12-31" ? "" : oldestDue,
      invoices: invoiceDetails,
    });
  }

  // Sort by total_due descending
  customers.sort((a, b) => b.total_due - a.total_due);

  return {
    customers,
    total_customers: customers.length,
    total_due: Math.round(grandTotal * 100) / 100,
  };
}

// ── Monthly invoice summary ──────────────────────────────────

export interface MonthlyInvoiceSummary {
  ved: { invoiced: number; collected: number; count: number };
  usd: { invoiced: number; collected: number; count: number };
}

/**
 * Get invoiced/collected totals for a given month, split by currency.
 * "Collected" = amount_total - amount_residual for posted invoices.
 */
export async function getMonthlyInvoiceSummary(
  year: number,
  month: number
): Promise<MonthlyInvoiceSummary> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const invoices = await searchRead("account.move", [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "posted"],
    ["invoice_date", ">=", startDate],
    ["invoice_date", "<", endDate],
  ], {
    fields: ["amount_total", "amount_residual", "currency_id"],
    limit: 5000,
  });

  const result: MonthlyInvoiceSummary = {
    ved: { invoiced: 0, collected: 0, count: 0 },
    usd: { invoiced: 0, collected: 0, count: 0 },
  };

  for (const inv of invoices) {
    const isUSD = inv.currency_id?.[0] === 1; // USD id=1, VED id=166
    const bucket = isUSD ? result.usd : result.ved;
    bucket.invoiced += inv.amount_total || 0;
    bucket.collected += (inv.amount_total || 0) - (inv.amount_residual || 0);
    bucket.count++;
  }

  // Round
  result.ved.invoiced = Math.round(result.ved.invoiced * 100) / 100;
  result.ved.collected = Math.round(result.ved.collected * 100) / 100;
  result.usd.invoiced = Math.round(result.usd.invoiced * 100) / 100;
  result.usd.collected = Math.round(result.usd.collected * 100) / 100;

  return result;
}

// ── Monthly history (drafts vs posted) ──────────────────────

export interface MonthlyHistoryEntry {
  month: string;         // "2026-03"
  label: string;         // "Mar 2026"
  drafted_usd: number;   // total borradores con vencimiento en este mes (meta de cobranza)
  collected_usd: number; // total ingresado en diarios bank/cash este mes (USD equiv)
  effectiveness: number; // % collected/drafted — efectividad de cobranza
}

/**
 * Monthly history: drafts (target) vs bank journal entries (collected).
 *
 * Business logic:
 * - Drafts are generated ~27th of previous month for the next month
 *   (e.g. draft created 27/02 with due date in March = March's target)
 * - Collections = total money that entered bank/cash journals that month
 *   (includes payments for current month + overdue from previous months)
 * - Effectiveness = collected / drafted × 100
 *   >100% means overdue payments also came in
 *
 * All amounts normalized to USD (VED divided by BCV rate).
 */
export async function getMonthlyHistory(months = 6, bcvRate?: number): Promise<MonthlyHistoryEntry[]> {
  const now = new Date();
  const rate = bcvRate || 474;

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const ranges: Array<{ start: string; end: string; month: string; label: string }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const nextD = new Date(y, m, 1);
    const ny = nextD.getFullYear();
    const nm = nextD.getMonth() + 1;
    ranges.push({
      start: `${y}-${String(m).padStart(2, "0")}-01`,
      end: `${ny}-${String(nm).padStart(2, "0")}-01`,
      month: `${y}-${String(m).padStart(2, "0")}`,
      label: `${monthNames[m - 1]} ${y}`,
    });
  }

  const fullStart = ranges[0].start;
  const fullEnd = ranges[ranges.length - 1].end;

  const [allBankMoves] = await Promise.all([
    // Bank/cash journal entries in range (posted + draft for complete picture)
    searchRead("account.move", [
      ["move_type", "=", "entry"],
      ["journal_id.type", "in", ["bank", "cash"]],
      ["state", "in", ["posted", "draft"]],
      ["date", ">=", fullStart],
      ["date", "<", fullEnd],
    ], { fields: ["amount_total", "date", "currency_id"], limit: 10000 }),
  ]);

  // For each month-end, count total outstanding drafts (accumulated debt)
  // A draft created before month-end that is still in draft state = unpaid
  const draftByMonth = new Map<string, number>();
  for (const r of ranges) {
    const allDraftsAtEnd = await searchRead("account.move", [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "draft"],
      ["invoice_date_due", "<", r.end],
    ], { fields: ["amount_total"], limit: 10000 });

    let total = 0;
    for (const d of allDraftsAtEnd) total += d.amount_total || 0;
    draftByMonth.set(r.month, total);
  }

  // Group bank entries by month, convert VED to USD
  const collectedByMonth = new Map<string, number>();
  for (const mv of allBankMoves) {
    if (!mv.date) continue;
    const m = mv.date.substring(0, 7);
    const isUSD = mv.currency_id?.[0] === 1;
    const amountUsd = isUSD ? (mv.amount_total || 0) : (mv.amount_total || 0) / rate;
    collectedByMonth.set(m, (collectedByMonth.get(m) || 0) + amountUsd);
  }

  const results: MonthlyHistoryEntry[] = [];
  for (const r of ranges) {
    const drafted = Math.round((draftByMonth.get(r.month) || 0) * 100) / 100;
    const collected = Math.round((collectedByMonth.get(r.month) || 0) * 100) / 100;
    results.push({
      month: r.month,
      label: r.label,
      drafted_usd: drafted,
      collected_usd: collected,
      effectiveness: drafted > 0 ? Math.round((collected / drafted) * 1000) / 10 : 0,
    });
  }

  return results;
}

// ── Payment distribution by journal ─────────────────────────

export interface JournalPayment {
  journal_id: number;
  journal_name: string;
  count: number;
  total: number;
  currency: string;
  posted_count: number;
  posted_total: number;
  draft_count: number;
  draft_total: number;
}

/**
 * Get payment distribution by bank journal for a given month.
 * Payments are account.move entries with journal type bank/cash.
 * Includes both posted and draft entries — draft = registered but unassigned.
 * total = posted + draft for a complete picture.
 * Only returns journals with activity (count > 0).
 */
export async function getPaymentsByJournal(year: number, month: number): Promise<JournalPayment[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const moves = await searchRead("account.move", [
    ["move_type", "=", "entry"],
    ["journal_id.type", "in", ["bank", "cash"]],
    ["state", "in", ["posted", "draft"]],
    ["date", ">=", startDate],
    ["date", "<", endDate],
  ], {
    fields: ["amount_total", "journal_id", "currency_id", "state"],
    limit: 5000,
  });

  const byJournal = new Map<number, JournalPayment>();
  for (const m of moves) {
    const jid = m.journal_id?.[0];
    const jname = m.journal_id?.[1] || "Desconocido";
    if (!byJournal.has(jid)) {
      byJournal.set(jid, {
        journal_id: jid,
        journal_name: getJournalDisplayName(jname),
        count: 0,
        total: 0,
        currency: m.currency_id?.[1] || "VED",
        posted_count: 0,
        posted_total: 0,
        draft_count: 0,
        draft_total: 0,
      });
    }
    const j = byJournal.get(jid)!;
    const amt = m.amount_total || 0;
    j.count++;
    j.total += amt;
    if (m.state === "draft") {
      j.draft_count++;
      j.draft_total += amt;
    } else {
      j.posted_count++;
      j.posted_total += amt;
    }
  }

  return Array.from(byJournal.values())
    .filter(j => j.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ── Subscription summary ─────────────────────────────────────

export interface SubscriptionSummary {
  active: number;
  paused: number;
  mrr_usd: number;
}

/**
 * Get service (line) counts and real MRR from sale.order.line.
 * MRR = sum of price_subtotal for lines with service_state = "progress".
 * Counts are based on individual service lines, not parent subscriptions.
 */
export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  const lines = await searchRead("sale.order.line", [
    ["order_id.is_subscription", "=", true],
    ["order_id.subscription_state", "in", ["3_progress", "4_paused"]],
    ["product_id", "!=", false],
  ], {
    fields: ["price_subtotal", "service_state"],
    limit: 10000,
  });

  let active = 0;
  let paused = 0;
  let mrr = 0;

  for (const l of lines) {
    const state = l.service_state || "";
    if (state === "progress") {
      active++;
      mrr += l.price_subtotal || 0;
    } else if (state === "suspended" || state === "paused") {
      paused++;
    }
  }

  return {
    active,
    paused,
    mrr_usd: Math.round(mrr * 100) / 100,
  };
}

// ── Plan distribution ────────────────────────────────────────

export interface PlanCategory {
  category: string;
  total: number;
  active: number;
  paused: number;
  plans: Array<{ code: string; name: string; active: number; paused: number; total: number }>;
}

/**
 * Get distribution of plans/services across active+paused subscriptions.
 * Groups by category: Beam, Fibra, Legacy, Dedicado, Business, Addon.
 */
export async function getPlanDistribution(): Promise<PlanCategory[]> {
  // Get subscription lines with product info
  const lines = await searchRead("sale.order.line", [
    ["order_id.is_subscription", "=", true],
    ["order_id.subscription_state", "in", ["3_progress", "4_paused"]],
    ["product_id", "!=", false],
  ], {
    fields: ["product_id", "product_uom_qty", "order_id"],
    limit: 6000,
  });

  // Get subscription states for each order
  const orderIds = Array.from(new Set(lines.map((l: any) => l.order_id[0]))) as number[];
  const orders = await read("sale.order", orderIds, ["subscription_state"]);
  const orderState = new Map(orders.map((o: any) => [o.id, o.subscription_state]));

  // Group by product
  const byProduct = new Map<string, { code: string; name: string; active: number; paused: number; total: number }>();

  for (const l of lines) {
    const fullName: string = l.product_id[1];
    const code = fullName.match(/\[([^\]]+)\]/)?.[1] || "";
    // Skip non-plan items
    if (!code || code.startsWith("CCC") || code.startsWith("AAA") || code === "DESACTV") continue;

    const shortName = fullName.replace(/\[.*?\]\s*/, "");
    const state = orderState.get(l.order_id[0]);
    const qty = l.product_uom_qty || 1;

    if (!byProduct.has(code)) {
      byProduct.set(code, { code, name: shortName, active: 0, paused: 0, total: 0 });
    }
    const entry = byProduct.get(code)!;
    if (state === "3_progress") entry.active += qty;
    else entry.paused += qty;
    entry.total += qty;
  }

  // Categorize
  const cats: Record<string, Array<{ code: string; name: string; active: number; paused: number; total: number }>> = {
    Beam: [], Fibra: [], Legacy: [], Dedicado: [], Business: [], Addon: [],
  };

  for (const plan of byProduct.values()) {
    if (plan.code.startsWith("BM") && !plan.code.startsWith("BS")) cats.Beam.push(plan);
    else if (plan.code.startsWith("FO")) cats.Fibra.push(plan);
    else if (plan.code.startsWith("LG")) cats.Legacy.push(plan);
    else if (plan.code.startsWith("DD")) cats.Dedicado.push(plan);
    else if (plan.code.startsWith("BS")) cats.Business.push(plan);
    else cats.Addon.push(plan);
  }

  const result: PlanCategory[] = [];
  for (const [category, plans] of Object.entries(cats)) {
    if (plans.length === 0) continue;
    plans.sort((a, b) => b.total - a.total);
    result.push({
      category,
      total: plans.reduce((s, p) => s + p.total, 0),
      active: plans.reduce((s, p) => s + p.active, 0),
      paused: plans.reduce((s, p) => s + p.paused, 0),
      plans,
    });
  }
  result.sort((a, b) => b.total - a.total);
  return result;
}

// ── Client list & detail (Fase 3) ───────────────────────────

import type {
  OdooClient, OdooClientDetail, OdooSubscription,
  OdooSubscriptionLine, OdooPayment,
} from "@/types/odoo";

const CLIENT_LIST_FIELDS = [
  "name", "vat", "email", "mobile", "phone", "city", "state_id",
  "l10n_latam_identification_type_id", "is_company",
  "subscription_count", "subscription_status", "suspend",
  "credit", "total_due", "total_invoiced", "unpaid_invoices_count",
] as const;

const CLIENT_DETAIL_FIELDS = [
  ...CLIENT_LIST_FIELDS,
  "ref", "company_type", "function", "street", "street2",
  "country_id", "zip", "municipality_id", "parish_id",
  "partner_latitude", "partner_longitude",
  "l10n_ve_responsibility_type_id", "property_product_pricelist",
  "debit", "total_due", "total_overdue", "days_sales_outstanding",
  "trust", "followup_status", "not_suspend",
  "sale_order_count", "ticket_count",
  "category_id", "comment", "active",
] as const;

/**
 * List customers with pagination and filters. Returns summary data per client
 * plus their main plan names and MRR from subscriptions.
 */
export async function getOdooClients(options?: {
  search?: string;
  status?: string;  // "active" | "paused" | "suspended" | "debt"
  page?: number;
  limit?: number;
}): Promise<{ clients: OdooClient[]; total: number; page: number; limit: number }> {
  const pageSize = Math.min(options?.limit || 50, 100);
  const page = Math.max(options?.page || 1, 1);
  const offset = (page - 1) * pageSize;

  // Include clients with customer_rank OR active subscriptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const domain: any[] = ["|", ["customer_rank", ">", 0], ["subscription_count", ">", 0]];

  // Status filter — based on subscription state, NOT suspend field
  if (options?.status === "active") {
    domain.push(["subscription_status", "=", "progress"]);
  } else if (options?.status === "paused") {
    domain.push(["subscription_status", "in", ["paused", "suspended"]]);
  } else if (options?.status === "no_service") {
    domain.push(["subscription_count", "=", 0]);
  } else if (options?.status === "debt") {
    domain.push(["total_due", ">", 0]);
  }

  // Search filter — search partners first, then filter by ID
  const safeQ = sanitizeOdooSearch(options?.search);
  if (safeQ) {
    const q = safeQ;
    const matchingPartners = await searchRead("res.partner", [
      "|", "|", "|", "|",
      ["name", "ilike", q],
      ["vat", "ilike", q],
      ["email", "ilike", q],
      ["mobile", "ilike", q],
      ["ref", "ilike", q],
    ], { fields: ["id"], limit: 500 });
    const pids = matchingPartners.map((p: any) => p.id);
    if (pids.length === 0) {
      return { clients: [], total: 0, page, limit: pageSize };
    }
    domain.push(["id", "in", pids]);
  }

  const [total, rawClients] = await Promise.all([
    searchCount("res.partner", domain),
    searchRead("res.partner", domain, {
      fields: [...CLIENT_LIST_FIELDS],
      limit: pageSize,
      offset,
      order: "name asc",
    }),
  ]);

  // Get service lines for these clients to extract main plans and MRR
  const partnerIds = rawClients.map((c: any) => c.id);
  const subsByPartner = new Map<number, { plans: string[]; mrr: number; serviceCount: number; servicesActive: number; servicesSuspended: number }>();

  if (partnerIds.length > 0) {
    const lines = await searchRead("sale.order.line", [
      ["order_partner_id", "in", partnerIds],
      ["order_id.is_subscription", "=", true],
      ["order_id.subscription_state", "in", ["3_progress", "4_paused"]],
      ["product_id", "!=", false],
    ], {
      fields: ["order_partner_id", "product_id", "price_subtotal", "service_state"],
      limit: 10000,
    });

    for (const l of lines) {
      const pid = l.order_partner_id[0];
      if (!subsByPartner.has(pid)) subsByPartner.set(pid, { plans: [], mrr: 0, serviceCount: 0, servicesActive: 0, servicesSuspended: 0 });
      const entry = subsByPartner.get(pid)!;
      const name = l.product_id?.[1]?.replace(/\[.*?\]\s*/, "") || "";
      const state = l.service_state || "";

      entry.serviceCount++;
      if (state === "progress") {
        entry.servicesActive++;
        entry.mrr += l.price_subtotal || 0;
      } else if (state === "suspended") {
        entry.servicesSuspended++;
      }
      if (name && !entry.plans.includes(name)) entry.plans.push(name);
    }
  }

  const clients: OdooClient[] = rawClients.map((c: any) => {
    const subData = subsByPartner.get(c.id);
    return {
      id: c.id,
      name: c.name || "",
      vat: c.vat || "",
      identification_type: c.l10n_latam_identification_type_id?.[1] || "",
      is_company: c.is_company || false,
      email: c.email || "",
      mobile: c.mobile || "",
      phone: c.phone || "",
      city: c.city || "",
      state: c.state_id?.[1]?.replace(" (VE)", "") || "",
      subscription_count: c.subscription_count || 0,
      subscription_status: c.subscription_status || "",
      suspend: c.suspend || false,
      credit: c.credit || 0,
      total_due: c.total_due || 0,
      total_invoiced: c.total_invoiced || 0,
      unpaid_invoices_count: c.unpaid_invoices_count || 0,
      service_count: subData?.serviceCount || 0,
      services_active: subData?.servicesActive || 0,
      services_suspended: subData?.servicesSuspended || 0,
      main_plans: subData?.plans || [],
      mrr_usd: Math.round((subData?.mrr || 0) * 100) / 100,
    };
  });

  return { clients, total, page, limit: pageSize };
}

/**
 * Full client profile with subscriptions, invoices, and payments.
 */
export async function getOdooClientDetail(partnerId: number): Promise<OdooClientDetail> {
  // All queries in parallel
  const [rawPartner, rawSubs, rawDraftInvoices, rawPostedInvoices, rawPayments, rawTags] = await Promise.all([
    // 1. Partner full data
    read("res.partner", [partnerId], [...CLIENT_DETAIL_FIELDS]),
    // 2. Subscriptions
    searchRead("sale.order", [
      ["partner_id", "=", partnerId],
      ["is_subscription", "=", true],
    ], {
      fields: ["name", "subscription_state", "start_date", "next_invoice_date",
               "recurring_monthly", "amount_total", "currency_id", "order_line"],
      limit: 50,
      order: "subscription_state asc, start_date desc",
    }),
    // 3. Pending invoices (drafts = accounts receivable)
    searchRead("account.move", [
      ["partner_id", "=", partnerId],
      ["move_type", "=", "out_invoice"],
      ["state", "=", "draft"],
    ], {
      fields: ["name", "invoice_date", "invoice_date_due", "amount_total",
               "amount_residual", "currency_id", "payment_state", "state"],
      limit: 50,
      order: "invoice_date_due desc",
    }),
    // 3b. Paid invoices (posted = collected revenue)
    searchRead("account.move", [
      ["partner_id", "=", partnerId],
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
    ], {
      fields: ["name", "invoice_date", "invoice_date_due", "amount_total",
               "amount_residual", "currency_id", "payment_state", "state",
               "ref", "payment_reference", "invoice_payments_widget"],
      limit: 20,
      order: "invoice_date desc",
    }),
    // 4. Recent payments (bank/cash journal entries for this client)
    searchRead("account.move", [
      ["partner_id", "=", partnerId],
      ["move_type", "=", "entry"],
      ["journal_id.type", "in", ["bank", "cash"]],
      ["state", "=", "posted"],
    ], {
      fields: ["date", "amount_total", "currency_id", "journal_id", "ref"],
      limit: 20,
      order: "date desc",
    }),
    // 5. Tags
    searchRead("res.partner.category", [
      ["partner_ids", "in", [partnerId]],
    ], { fields: ["name"], limit: 20 }),
  ]);

  const p = rawPartner[0];
  if (!p) throw new Error("Cliente no encontrado en Odoo");

  // Get subscription lines
  const allLineIds: number[] = [];
  for (const s of rawSubs) {
    if (s.order_line) allLineIds.push(...s.order_line);
  }

  const linesMap = new Map<number, OdooSubscriptionLine>();
  if (allLineIds.length > 0) {
    const rawLines = await searchRead("sale.order.line", [
      ["id", "in", allLineIds],
    ], {
      fields: ["id", "product_id", "name", "product_uom_qty", "price_unit",
               "price_subtotal", "discount", "service_state"],
      limit: 500,
    });
    for (const l of rawLines) {
      const fullName: string = l.product_id?.[1] || l.name || "";
      linesMap.set(l.id, {
        product_code: fullName.match(/\[([^\]]+)\]/)?.[1] || "",
        product_name: fullName.replace(/\[.*?\]\s*/, ""),
        quantity: l.product_uom_qty || 1,
        price_unit: l.price_unit || 0,
        price_subtotal: l.price_subtotal || 0,
        discount: l.discount || 0,
        service_state: l.service_state || "",
      });
    }
  }

  // Map subscriptions
  const subscriptions: OdooSubscription[] = rawSubs
    .filter((s: any) => s.subscription_state) // skip non-active
    .map((s: any) => ({
      id: s.id,
      name: s.name || "",
      state: s.subscription_state || "",
      start_date: s.start_date || "",
      next_invoice_date: s.next_invoice_date || "",
      recurring_monthly: s.recurring_monthly || 0,
      amount_total: s.amount_total || 0,
      currency: s.currency_id?.[1] || "USD",
      lines: (s.order_line || [])
        .map((id: number) => linesMap.get(id))
        .filter(Boolean) as OdooSubscriptionLine[],
    }));

  // Fetch invoice lines for both drafts and posted
  const allInvoiceIds = [
    ...rawDraftInvoices.map((i: any) => i.id),
    ...rawPostedInvoices.map((i: any) => i.id),
  ];
  const invoiceLinesByMove = new Map<number, Array<{ product_name: string; quantity: number; price_unit: number; price_subtotal: number; price_total: number }>>();
  if (allInvoiceIds.length > 0) {
    const rawLines = await searchRead("account.move.line", [
      ["move_id", "in", allInvoiceIds],
      ["display_type", "=", "product"],
    ], {
      fields: ["move_id", "product_id", "name", "quantity", "price_unit", "price_subtotal", "price_total"],
      limit: 500,
    });
    for (const l of rawLines) {
      const moveId = l.move_id[0];
      if (!invoiceLinesByMove.has(moveId)) invoiceLinesByMove.set(moveId, []);
      invoiceLinesByMove.get(moveId)!.push({
        product_name: l.product_id?.[1]?.replace(/\[.*?\]\s*/, "") || l.name || "",
        quantity: l.quantity || 1,
        price_unit: l.price_unit || 0,
        price_subtotal: l.price_subtotal || 0,
        price_total: l.price_total || 0,
      });
    }
  }

  // Map invoices: drafts (pending) + posted (paid)
  const pendingInvoices: OdooInvoiceDetail[] = rawDraftInvoices.map((inv: any) => ({
    id: inv.id,
    invoice_number: inv.name || "",
    invoice_date: inv.invoice_date || "",
    due_date: inv.invoice_date_due || "",
    total: inv.amount_total || 0,
    amount_due: inv.amount_total || 0,
    currency: inv.currency_id?.[1] || "USD",
    payment_state: "not_paid",
    products: (invoiceLinesByMove.get(inv.id) || []).map(l => l.product_name),
    lines: invoiceLinesByMove.get(inv.id) || [],
    ref: "",
    payments: [],
  }));
  const paidInvoices: OdooInvoiceDetail[] = rawPostedInvoices.map((inv: any) => {
    // Parse payment widget to extract linked payments
    let linkedPayments: Array<{ journal_name: string; amount: number; date: string; ref: string }> = [];
    try {
      const widget = typeof inv.invoice_payments_widget === "string"
        ? JSON.parse(inv.invoice_payments_widget)
        : inv.invoice_payments_widget;
      if (widget?.content) {
        linkedPayments = widget.content.map((p: any) => ({
          journal_name: getJournalDisplayName(p.journal_name || ""),
          amount: p.amount || 0,
          date: p.date || "",
          ref: p.ref?.replace(/^[A-Z]+\d*\/\d+\/\d+\s*/, "").replace(/^Pago manual:\s*/, "") || "",
        }));
      }
    } catch { /* ignore parse errors */ }

    return {
      id: inv.id,
      invoice_number: inv.name || "",
      invoice_date: inv.invoice_date || "",
      due_date: inv.invoice_date_due || "",
      total: inv.amount_total || 0,
      amount_due: 0,
      currency: inv.currency_id?.[1] || "USD",
      payment_state: "paid",
      products: (invoiceLinesByMove.get(inv.id) || []).map(l => l.product_name),
      lines: invoiceLinesByMove.get(inv.id) || [],
      ref: inv.payment_reference || inv.ref || "",
      payments: linkedPayments,
    };
  });
  // Combine: pending first, then paid
  const invoices: OdooInvoiceDetail[] = [...pendingInvoices, ...paidInvoices];

  // Calculate real debt:
  // credit > 0 = owes money (posted unpaid VED) → add to debt
  // credit < 0 = overpaid (saldo a favor VED) → subtract from debt
  const draftTotalUsd = pendingInvoices.reduce((s, i) => s + i.amount_due, 0);
  const partnerCredit = p.credit || 0;
  const creditUsd = partnerCredit / 474; // approximate BCV fallback
  const netDueUsd = Math.max(draftTotalUsd + creditUsd, 0);

  // Map payments (bank/cash journal entries)
  const payments: OdooPayment[] = rawPayments.map((pay: any) => ({
    id: pay.id,
    date: pay.date || "",
    amount: pay.amount_total || 0,
    currency: pay.currency_id?.[1] || "VED",
    journal: getJournalDisplayName(pay.journal_id?.[1] || ""),
    ref: pay.ref || "",
  }));

  return {
    id: p.id,
    name: p.name || "",
    vat: p.vat || "",
    ref: p.ref || "",
    identification_type: p.l10n_latam_identification_type_id?.[1] || "",
    responsibility_type: p.l10n_ve_responsibility_type_id?.[1] || "",
    is_company: p.is_company || false,
    company_type: p.company_type || "",
    email: p.email || "",
    mobile: p.mobile || "",
    phone: p.phone || "",
    function: p.function || "",
    street: p.street || "",
    street2: p.street2 || "",
    city: p.city || "",
    state: p.state_id?.[1]?.replace(" (VE)", "") || "",
    state_id: p.state_id?.[0] || 0,
    country: p.country_id?.[1] || "",
    zip: p.zip || "",
    municipality: p.municipality_id?.[1] || "",
    parish: p.parish_id?.[1] || "",
    latitude: p.partner_latitude || 0,
    longitude: p.partner_longitude || 0,
    credit: p.credit || 0,
    debit: p.debit || 0,
    total_invoiced: p.total_invoiced || 0,
    total_due: Math.round(netDueUsd * 100) / 100, // net debt: drafts - credit favor (USD)
    total_overdue: p.total_overdue || 0,
    days_sales_outstanding: p.days_sales_outstanding || 0,
    trust: p.trust || "",
    followup_status: p.followup_status || "",
    pricelist: p.property_product_pricelist?.[1] || "",
    subscription_count: p.subscription_count || 0,
    subscription_status: p.subscription_status || "",
    suspend: p.suspend || false,
    not_suspend: p.not_suspend || false,
    sale_order_count: p.sale_order_count || 0,
    unpaid_invoices_count: p.unpaid_invoices_count || 0,
    ticket_count: p.ticket_count || 0,
    tags: rawTags.map((t: any) => t.name),
    notes: (typeof p.comment === "string" ? p.comment : "") || "",
    subscriptions,
    invoices,
    payments,
  };
}

// ── Mikrotik Network Infrastructure ─────────────────────────

import type { MikrotikNode, MikrotikRouter, MikrotikService } from "@/types/odoo";

const MK_SERVICE_FIELDS = [
  "name", "partner_id", "product_id", "state", "subscription_state",
  "node_id", "router_id", "monitoring_id", "connected_to",
  "ip_cpe", "ipv4", "address", "categ_id",
  "subscription_id", "date", "date_suspend",
  "mikrotik_activated", "to_suspend", "to_change_plan",
  "mobile", "phone", "payment_promise_date",
];

function mapMkService(s: any): MikrotikService {
  return {
    id: s.id,
    name: s.name || "",
    partner_id: s.partner_id?.[0] || 0,
    partner_name: s.partner_id?.[1] || "",
    product_name: s.product_id?.[1] || "",
    state: s.state || "",
    node_name: s.node_id?.[1] || "",
    node_id: s.node_id?.[0] || 0,
    router_name: s.router_id?.[1] || "",
    router_id: s.router_id?.[0] || 0,
    monitoring_sector: s.monitoring_id?.[1] || "",
    ip_cpe: s.ip_cpe || "",
    ipv4: s.ipv4?.[1] || s.ipv4 || "",
    address: s.address || "",
    category: s.categ_id?.[1] || "",
    subscription_ref: s.subscription_id?.[1] || "",
    install_date: s.date || "",
    suspend_date: s.date_suspend || "",
    mikrotik_activated: s.mikrotik_activated || false,
    to_suspend: s.to_suspend || false,
    to_change_plan: s.to_change_plan || false,
    mobile: s.mobile || "",
    phone: s.phone || "",
    payment_promise_date: s.payment_promise_date || "",
  };
}

/**
 * Get all Mikrotik nodes with service counts.
 */
export async function getMikrotikNodes(): Promise<MikrotikNode[]> {
  const [rawNodes, rawServices] = await Promise.all([
    searchRead("mikrotik.node", [], {
      fields: ["name", "interface", "router_id"],
      limit: 200,
    }),
    searchRead("mikrotik.service", [
      ["state", "in", ["progress", "suspended"]],
    ], {
      fields: ["node_id", "state", "subscription_id"],
      limit: 5000,
    }),
  ]);

  // Collect subscription IDs from active services to get MRR
  const subIds = new Set<number>();
  const serviceSubMap = new Map<number, number>(); // service.id → subscription_id
  for (const s of rawServices) {
    if (s.state === "progress" && s.subscription_id?.[0]) {
      subIds.add(s.subscription_id[0]);
      serviceSubMap.set(s.id, s.subscription_id[0]);
    }
  }

  // Get subscription line prices grouped by subscription
  const subMrr = new Map<number, number>(); // subscription_id → recurring_monthly
  if (subIds.size > 0) {
    const subs = await searchRead("sale.order", [
      ["id", "in", Array.from(subIds)],
    ], {
      fields: ["recurring_monthly", "order_line"],
      limit: 3000,
    });
    // Get per-line prices for more accurate per-service MRR
    const allLineIds: number[] = [];
    for (const sub of subs) {
      if (sub.order_line) allLineIds.push(...sub.order_line);
    }
    const linePrices = new Map<number, number>();
    if (allLineIds.length > 0) {
      const lines = await searchRead("sale.order.line", [
        ["id", "in", allLineIds],
        ["product_id", "!=", false],
      ], {
        fields: ["order_id", "price_subtotal"],
        limit: 10000,
      });
      // Average price per line per subscription
      const subLineCounts = new Map<number, { total: number; count: number }>();
      for (const l of lines) {
        const sid = l.order_id[0];
        if (!subLineCounts.has(sid)) subLineCounts.set(sid, { total: 0, count: 0 });
        const entry = subLineCounts.get(sid)!;
        entry.total += l.price_subtotal || 0;
        entry.count++;
      }
      for (const [sid, data] of subLineCounts) {
        subMrr.set(sid, data.count > 0 ? data.total / data.count : 0);
      }
    }
  }

  // Count services per node + MRR
  const nodeCounts = new Map<number, { active: number; suspended: number; mrr: number }>();
  for (const s of rawServices) {
    const nid = s.node_id?.[0];
    if (!nid) continue;
    if (!nodeCounts.has(nid)) nodeCounts.set(nid, { active: 0, suspended: 0, mrr: 0 });
    const c = nodeCounts.get(nid)!;
    if (s.state === "progress") {
      c.active++;
      const sid = s.subscription_id?.[0];
      if (sid && subMrr.has(sid)) c.mrr += subMrr.get(sid)!;
    } else if (s.state === "suspended") {
      c.suspended++;
    }
  }

  return rawNodes.map((n: any) => {
    const counts = nodeCounts.get(n.id) || { active: 0, suspended: 0, mrr: 0 };
    return {
      id: n.id,
      name: n.name || "",
      interface_name: n.interface || "",
      router_id: n.router_id?.[0] || 0,
      router_name: n.router_id?.[1] || "",
      services_active: counts.active,
      services_suspended: counts.suspended,
      services_total: counts.active + counts.suspended,
      mrr_usd: Math.round(counts.mrr * 100) / 100,
    };
  }).sort((a, b) => b.services_total - a.services_total);
}

/**
 * Get services for a specific node.
 */
export async function getMikrotikNodeDetail(
  nodeId: number,
  options?: { state?: string; search?: string }
): Promise<MikrotikService[]> {
  const domain: any[] = [["node_id", "=", nodeId]];

  if (options?.state) {
    domain.push(["state", "=", options.state]);
  } else {
    domain.push(["state", "in", ["progress", "suspended"]]);
  }

  const safeSvcSearch = sanitizeOdooSearch(options?.search);
  if (safeSvcSearch) {
    domain.unshift("|", "|", "|");
    domain.push(
      ["name", "ilike", safeSvcSearch],
      ["ip_cpe", "ilike", safeSvcSearch],
      ["partner_id.name", "ilike", safeSvcSearch],
    );
  }

  const raw = await searchRead("mikrotik.service", domain, {
    fields: MK_SERVICE_FIELDS,
    limit: 500,
    order: "state asc, name asc",
  });

  return raw.map(mapMkService);
}

/**
 * Get Mikrotik services for a specific client (partner).
 */
export async function getMikrotikServiceByPartner(
  partnerId: number
): Promise<MikrotikService[]> {
  const raw = await searchRead("mikrotik.service", [
    ["partner_id", "=", partnerId],
    ["state", "in", ["progress", "suspended", "closed"]],
  ], {
    fields: MK_SERVICE_FIELDS,
    limit: 50,
    order: "state asc, date desc",
  });

  return raw.map(mapMkService);
}

/**
 * Get all Mikrotik routers with their nodes.
 */
export async function getMikrotikRouters(): Promise<MikrotikRouter[]> {
  const [rawRouters, nodes] = await Promise.all([
    searchRead("router.mikrotik", [], {
      fields: ["name", "ip_host", "location", "router_type"],
      limit: 50,
    }),
    getMikrotikNodes(),
  ]);

  return rawRouters.map((r: any) => ({
    id: r.id,
    name: r.name || "",
    ip_host: r.ip_host || "",
    location: r.location || "",
    router_type: r.router_type || "",
    nodes: nodes.filter((n) => n.router_id === r.id),
  }));
}

/**
 * Search services globally by IP, reference, or client name.
 */
export async function searchMikrotikServices(
  query: string
): Promise<MikrotikService[]> {
  const domain: any[] = [
    ["state", "in", ["progress", "suspended"]],
    "|", "|", "|",
    ["name", "ilike", query],
    ["ip_cpe", "ilike", query],
    ["partner_id.name", "ilike", query],
    ["ipv4.name", "ilike", query],
  ];

  const raw = await searchRead("mikrotik.service", domain, {
    fields: MK_SERVICE_FIELDS,
    limit: 50,
    order: "state asc, name asc",
  });

  return raw.map(mapMkService);
}

// ── Expenses / Egresos ──────────────────────────────────────

// Category mapping: group 60+ expense accounts into readable categories
const EXPENSE_CATEGORIES: Record<string, string> = {
  "5101": "Costo del servicio",
  "6101": "Gastos operativos",
  "6102": "Nómina y RRHH",
  "6103": "Administración",
  "6104": "Gastos financieros",
  "6105": "Depreciación",
};

function getExpenseCategory(code: string): string {
  const prefix = code.substring(0, 4);
  return EXPENSE_CATEGORIES[prefix] || "Otros";
}

export interface ExpensesByCategory {
  category: string;
  total_usd: number;
  total_ved: number;
  line_count: number;
  pct: number;
}

export interface ExpensesByMonth {
  month: string;
  label: string;
  total_usd: number;
  total_ved: number;
  line_count: number;
}

export interface ExpensesByVendor {
  vendor_id: number;
  vendor_name: string;
  total_usd: number;
  total_ved: number;
  bill_count: number;
}

export interface ExpensesSummary {
  period: string;
  total_usd: number;
  total_ved: number;
  line_count: number;
  by_category: ExpensesByCategory[];
  by_month: ExpensesByMonth[];
  by_vendor: ExpensesByVendor[];
  bcv_rate_current: number;
}

/**
 * Fetch expense data from Odoo for a date range.
 * Uses account.move.line on expense accounts (5xxx/6xxx) with historical BCV rates.
 * All amounts converted to USD at the BCV rate of the transaction date.
 */
export async function getExpensesSummary(
  startDate: string,
  endDate: string,
  periodLabel?: string,
): Promise<ExpensesSummary> {

  // 1. Fetch historical BCV rates for the period
  const rawRates = await searchRead("res.currency.rate", [
    ["currency_id.name", "=", "USD"],
    ["name", ">=", startDate],
    ["name", "<", endDate],
  ], {
    fields: ["name", "inverse_company_rate"],
    limit: 400,
    order: "name asc",
  });

  // Build date → rate map (VED per 1 USD)
  const rateMap = new Map<string, number>();
  for (const r of rawRates) {
    if (r.name && r.inverse_company_rate) {
      rateMap.set(r.name, r.inverse_company_rate);
    }
  }

  // Helper: get rate for a date (exact match or closest previous)
  const sortedRateDates = [...rateMap.keys()].sort();
  const getRate = (date: string): number => {
    if (rateMap.has(date)) return rateMap.get(date)!;
    let best = sortedRateDates[0] || date;
    for (const d of sortedRateDates) {
      if (d <= date) best = d;
      else break;
    }
    return rateMap.get(best) || 1;
  };

  // Current rate (latest)
  const currentRate = sortedRateDates.length > 0
    ? rateMap.get(sortedRateDates[sortedRateDates.length - 1])!
    : 1;

  // 2. Fetch expense lines from account.move.line
  const expenseLines = await searchRead("account.move.line", [
    ["date", ">=", startDate],
    ["date", "<", endDate],
    ["parent_state", "=", "posted"],
    ["debit", ">", 0],
    "|", ["account_id.code", "=like", "5%"], ["account_id.code", "=like", "6%"],
  ], {
    fields: ["account_id", "debit", "date"],
    limit: 10000,
    order: "date asc",
  });

  // 3. Process lines
  const categoryMap = new Map<string, { total_usd: number; total_ved: number; count: number }>();
  const monthMap = new Map<string, { total_usd: number; total_ved: number; count: number }>();
  let grandTotalUsd = 0;
  let grandTotalVed = 0;

  for (const l of expenseLines) {
    const ved = l.debit || 0;
    const date = l.date || startDate;
    const rate = getRate(date);
    const usd = rate > 0 ? ved / rate : 0;

    const accName = l.account_id?.[1] || "?";
    const accCode = accName.match(/^(\d+)/)?.[1] || "?";
    const category = getExpenseCategory(accCode);

    if (!categoryMap.has(category)) categoryMap.set(category, { total_usd: 0, total_ved: 0, count: 0 });
    const cat = categoryMap.get(category)!;
    cat.total_usd += usd;
    cat.total_ved += ved;
    cat.count++;

    const month = date.substring(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, { total_usd: 0, total_ved: 0, count: 0 });
    const mo = monthMap.get(month)!;
    mo.total_usd += usd;
    mo.total_ved += ved;
    mo.count++;

    grandTotalUsd += usd;
    grandTotalVed += ved;
  }

  // 4. Fetch vendor bills for top vendors
  const vendorBills = await searchRead("account.move", [
    ["move_type", "=", "in_invoice"],
    ["state", "=", "posted"],
    ["invoice_date", ">=", startDate],
    ["invoice_date", "<", endDate],
  ], {
    fields: ["partner_id", "amount_total", "invoice_date"],
    limit: 5000,
  });

  const vendorMap = new Map<number, { name: string; total_usd: number; total_ved: number; count: number }>();
  for (const b of vendorBills) {
    const vid = b.partner_id?.[0] || 0;
    const vname = b.partner_id?.[1] || "?";
    const ved = b.amount_total || 0;
    const rate = getRate(b.invoice_date || startDate);
    const usd = rate > 0 ? ved / rate : 0;

    if (!vendorMap.has(vid)) vendorMap.set(vid, { name: vname, total_usd: 0, total_ved: 0, count: 0 });
    const v = vendorMap.get(vid)!;
    v.total_usd += usd;
    v.total_ved += ved;
    v.count++;
  }

  // 5. Build result
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const by_category: ExpensesByCategory[] = [...categoryMap.entries()]
    .map(([category, d]) => ({
      category,
      total_usd: round2(d.total_usd),
      total_ved: round2(d.total_ved),
      line_count: d.count,
      pct: grandTotalUsd > 0 ? round2((d.total_usd / grandTotalUsd) * 100) : 0,
    }))
    .sort((a, b) => b.total_usd - a.total_usd);

  const ML: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
  };

  const by_month: ExpensesByMonth[] = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      label: `${ML[month.split("-")[1]] || month.split("-")[1]} ${month.split("-")[0]}`,
      total_usd: round2(d.total_usd),
      total_ved: round2(d.total_ved),
      line_count: d.count,
    }));

  const by_vendor: ExpensesByVendor[] = [...vendorMap.entries()]
    .map(([vendor_id, d]) => ({
      vendor_id,
      vendor_name: d.name,
      total_usd: round2(d.total_usd),
      total_ved: round2(d.total_ved),
      bill_count: d.count,
    }))
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, 20);

  return {
    period: periodLabel || `${startDate} — ${endDate}`,
    total_usd: round2(grandTotalUsd),
    total_ved: round2(grandTotalVed),
    line_count: expenseLines.length,
    by_category,
    by_month,
    by_vendor,
    bcv_rate_current: round2(currentRate),
  };
}

// ============================================================
// PAYMENT SYNC (Fase 5) — Postear factura draft USD → posted VES
// ============================================================
//
// Cuando un webhook de Mercantil llega aprobado, este modulo:
//   1. Busca la factura draft del partner pagador
//   2. Convierte la moneda USD -> VED a la tasa BCV del dia
//   3. Recalcula price_unit de cada linea (USD * rate)
//   4. action_post la factura -> queda posted en VES
//
// CRITICO: incluye 3 capas de seguridad antes de tocar Odoo:
//   1. ODOO_SYNC_ENABLED env var (master kill switch)
//   2. ODOO_SYNC_PARTNER_WHITELIST (lista de partner_ids permitidos)
//   3. Validacion de monto VES esperado vs monto del pago real (tolerancia 10%)

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
  const list = await searchRead("sale.order",
    [["name", "=", name]],
    {
      fields: ["id", "name", "next_invoice_date", "is_subscription"],
      limit: 1,
    }
  );
  if (!list[0]) return null;
  const so = list[0];
  return {
    id: so.id,
    name: so.name,
    next_invoice_date: so.next_invoice_date,
  };
}

/**
 * Calcula el campo `month_billed` (texto del mes en espanol) que Odoo
 * espera en facturas con `custom_month_billed=true`.
 *
 * Logica: a partir del `next_invoice_date` de la suscripcion, calcular
 * el midpoint del periodo cubierto por la factura draft actual y devolver
 * el nombre del mes correspondiente.
 *
 * Ejemplo:
 *   next_invoice_date = "2026-05-27" (proxima factura)
 *   periodo cubierto = 2026-04-27 -> 2026-05-26
 *   midpoint = ~11 de mayo
 *   resultado = "Mayo"
 */
export function computeMonthBilled(nextInvoiceDate: string): string {
  const next = new Date(nextInvoiceDate + "T12:00:00Z");
  if (Number.isNaN(next.getTime())) return "";

  // periodo = [next_invoice_date - 1 mes, next_invoice_date - 1 dia]
  const periodEnd = new Date(next);
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);

  const periodStart = new Date(periodEnd);
  periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
  periodStart.setUTCDate(periodStart.getUTCDate() + 1);

  // midpoint
  const midpoint = new Date((periodStart.getTime() + periodEnd.getTime()) / 2);

  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return meses[midpoint.getUTCMonth()];
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
  //  1. Si paymentMethod indica pago en USD -> "usd-no-convert" (factura debe quedar en USD)
  //  2. Si la factura ya esta en VED -> "skip-conversion" (reentrada)
  //  3. Si la factura esta en USD y el pago es en VES -> "convert"
  const currentCurrencyName = invoice.currency_id?.[1];
  const mappingForMethod = paymentMethod ? PAYMENT_METHOD_MAPPING[paymentMethod] : undefined;
  const targetCurrencyId = mappingForMethod?.currencyId;
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

  // Resolver month_billed desde la suscripcion origen
  let subscription: PreviewResult["subscription"] = null;
  let month_billed: string | null = null;
  if (typeof invoice.invoice_origin === "string" && invoice.invoice_origin) {
    const sub = await getSubscriptionByName(invoice.invoice_origin);
    if (sub) {
      subscription = { id: sub.id, name: sub.name, next_invoice_date: sub.next_invoice_date };
      if (typeof sub.next_invoice_date === "string" && sub.next_invoice_date) {
        month_billed = computeMonthBilled(sub.next_invoice_date) || null;
      }
    }
  }
  validations.month_billed_resolved = !!month_billed;
  if (!month_billed) {
    warnings.push("No se pudo resolver month_billed desde la suscripcion origen — sin esto el action_post puede quedarse silenciosamente en draft");
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
    await odooWrite("account.move", [invoiceId], {
      custom_month_billed: true,
      month_billed: preview.month_billed,
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
  currencyId: number;
  description: string;
}

/**
 * Mapeo de metodo de pago de collection_items -> journal/payment_method_line
 * en Odoo. IDs verificados directamente en Odoo prod (2026-04-30).
 *
 * IMPORTANTE — multimoneda:
 *  - currencyId=166 (VED): la factura draft USD se convierte a VES al postear
 *    (logica de postInvoiceInVes con scenario "convert")
 *  - currencyId=1 (USD): la factura se postea en USD sin conversion
 *    (scenario "usd-no-convert")
 */
export const PAYMENT_METHOD_MAPPING: Record<string, PaymentMethodMapping> = {
  debito_inmediato: {
    journalId: 29,                  // BNK1 "Bank" -> cuenta 1102002 BANCO MERCANTIL 3031
    paymentMethodLineId: 47,        // "Pago manual" del journal Bank
    currencyId: 166,                // VED
    description: "Mercantil Bs (cuenta 3031)",
  },
  c2p: {
    journalId: 29,                  // mismo journal Mercantil Bs
    paymentMethodLineId: 47,
    currencyId: 166,
    description: "Mercantil Bs (cuenta 3031) — Pago Movil C2P",
  },
  transferencia: {
    journalId: 29,                  // default Mercantil Bs (todas las transferencias entran ahi)
    paymentMethodLineId: 47,
    currencyId: 166,
    description: "Mercantil Bs (cuenta 3031) — Transferencia",
  },
  cash: {                            // Cash en VES (efectivo en Bs)
    journalId: 38,                  // CSH2 "Efectivo Bs"
    paymentMethodLineId: 69,
    currencyId: 166,                // VED
    description: "Efectivo Bs",
  },
  cash_ves: {                        // alias explicito
    journalId: 38,
    paymentMethodLineId: 69,
    currencyId: 166,
    description: "Efectivo Bs",
  },
  cash_usd: {                        // Cash en USD (oficina PLC/Lecheria)
    journalId: 30,                  // CSH1 "Cash" (USD)
    paymentMethodLineId: 72,
    currencyId: 1,                  // USD
    description: "Cash USD",
  },
  stripe: {
    journalId: 41,                  // BNK6 "Banco Mercantil 9021" (USD)
    paymentMethodLineId: 119,       // "Stripe"
    currencyId: 1,                  // USD
    description: "Stripe -> Mercantil USD 9021",
  },
  paypal: {
    journalId: 41,                  // mismo Mercantil USD 9021
    paymentMethodLineId: 86,        // "PayPal"
    currencyId: 1,                  // USD
    description: "PayPal -> Mercantil USD 9021",
  },
};

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
  const memo = `${opts.paymentToken} — Mercantil Web ref:${opts.paymentReference}`;

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
    amount: invoice.amount_total,
    currency: invoice.currency_id?.[1] || "",
    mapping: mapping || ({} as PaymentMethodMapping),
    payment_date: paymentDate,
    memo,
    validations,
    warnings,
  };
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
    // 1. Crear el account.payment directamente (state inicial = draft)
    const paymentId = await odooCreate("account.payment", {
      payment_type: "inbound",
      partner_type: "customer",
      partner_id: preview.partner_id,
      journal_id: preview.mapping.journalId,
      payment_method_line_id: preview.mapping.paymentMethodLineId,
      amount: preview.amount,
      currency_id: preview.mapping.currencyId,
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
}

/**
 * Ejecuta el sync completo de un item a Odoo (postear factura + registrar
 * payment + reconciliar) con idempotencia paso a paso. Si postInvoiceDone
 * es true, salta el primer paso. Si registerPaymentDone es true, salta el
 * segundo. El cron de la cola usa esto para no repetir trabajo en reintentos.
 */
export async function syncOdooForCollectionItem(opts: {
  invoiceId: number;
  paymentMethod: string;
  paymentReference: string;
  paymentToken: string;
  paymentDate?: string;
  postInvoiceDone?: boolean;
  registerPaymentDone?: boolean;
}): Promise<SyncOdooResult> {
  const result: SyncOdooResult = {
    ok: false,
    post_invoice_done: opts.postInvoiceDone || false,
    register_payment_done: opts.registerPaymentDone || false,
  };

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
