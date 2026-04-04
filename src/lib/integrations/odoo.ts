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

// Cached uid — revalidated every hour
let cachedUid: number | null = null;
let cachedUidAt = 0;
const UID_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Helpers ──────────────────────────────────────────────────

export function isOdooConfigured(): boolean {
  return !!(ODOO_URL && ODOO_DB && ODOO_USER && ODOO_API_KEY);
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string; data: { message: string } };
}

async function jsonRpc(service: "common" | "object", method: string, args: any[]): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
  if (options?.search) {
    const partners = await searchRead("res.partner", [
      ["name", "ilike", options.search],
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
  const rate = options?.bcvRate || 95;
  // Draft invoices = accounts receivable (what clients owe)
  const domain: OdooDomain[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "draft"],
  ];

  if (options?.search) {
    const partners = await searchRead("res.partner", [
      ["name", "ilike", options.search],
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
  const rate = bcvRate || 95;

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
    // Bank/cash journal entries in range (actual money collected)
    searchRead("account.move", [
      ["move_type", "=", "entry"],
      ["journal_id.type", "in", ["bank", "cash"]],
      ["state", "=", "posted"],
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
}

/**
 * Get payment distribution by bank journal for a given month.
 * Payments are account.move entries with journal type bank/cash.
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
    ["state", "=", "posted"],
    ["date", ">=", startDate],
    ["date", "<", endDate],
  ], {
    fields: ["amount_total", "journal_id", "currency_id"],
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
      });
    }
    const j = byJournal.get(jid)!;
    j.count++;
    j.total += m.amount_total || 0;
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
 * Get subscription counts and real MRR from sale.order subscriptions.
 */
export async function getSubscriptionSummary(): Promise<SubscriptionSummary> {
  const subs = await searchRead("sale.order", [
    ["is_subscription", "=", true],
    ["subscription_state", "in", ["3_progress", "4_paused"]],
  ], {
    fields: ["subscription_state", "recurring_monthly"],
    limit: 5000,
  });

  let active = 0;
  let paused = 0;
  let mrr = 0;

  for (const s of subs) {
    if (s.subscription_state === "3_progress") {
      active++;
      mrr += s.recurring_monthly || 0;
    } else {
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
  "credit", "total_invoiced", "unpaid_invoices_count",
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
    domain.push(["credit", ">", 0]);
  }

  // Search filter — search partners first, then filter by ID
  if (options?.search) {
    const q = options.search;
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

  // Get subscriptions for these clients to extract main plans and MRR
  const partnerIds = rawClients.map((c: any) => c.id);
  const subsByPartner = new Map<number, { plans: string[]; mrr: number; serviceCount: number; servicesActive: number; servicesSuspended: number }>();

  if (partnerIds.length > 0) {
    const subs = await searchRead("sale.order", [
      ["partner_id", "in", partnerIds],
      ["is_subscription", "=", true],
      ["subscription_state", "in", ["3_progress", "4_paused"]],
    ], {
      fields: ["partner_id", "recurring_monthly", "order_line"],
      limit: 5000,
    });

    // Get all order line IDs
    const allLineIds: number[] = [];
    for (const s of subs) {
      if (s.order_line) allLineIds.push(...s.order_line);
    }

    // Get product names and service_state from lines
    const lineData = new Map<number, { name: string; state: string }>();
    if (allLineIds.length > 0) {
      const lines = await searchRead("sale.order.line", [
        ["id", "in", allLineIds],
        ["product_id", "!=", false],
      ], {
        fields: ["id", "product_id", "service_state"],
        limit: 10000,
      });
      for (const l of lines) {
        const name = l.product_id?.[1]?.replace(/\[.*?\]\s*/, "") || "";
        if (name) lineData.set(l.id, { name, state: l.service_state || "" });
      }
    }

    // Group by partner
    for (const s of subs) {
      const pid = s.partner_id[0];
      if (!subsByPartner.has(pid)) subsByPartner.set(pid, { plans: [], mrr: 0, serviceCount: 0, servicesActive: 0, servicesSuspended: 0 });
      const entry = subsByPartner.get(pid)!;
      entry.mrr += s.recurring_monthly || 0;
      for (const lineId of (s.order_line || [])) {
        const ld = lineData.get(lineId);
        if (ld) {
          entry.serviceCount++;
          if (ld.state === "progress") entry.servicesActive++;
          else if (ld.state === "suspended") entry.servicesSuspended++;
          if (!entry.plans.includes(ld.name)) entry.plans.push(ld.name);
        }
      }
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
  const creditUsd = partnerCredit / 95; // approximate BCV
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
