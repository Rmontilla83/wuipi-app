// ============================================================
// Odoo 18 JSON-RPC Integration
// Docs: https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
// ============================================================

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

type OdooDomain = Array<string | number | boolean | string[] | number[]>;

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
 * Fetch pending invoices from Odoo.
 * Optional: pass partner name to filter by customer.
 */
export async function getPendingInvoices(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: OdooInvoice[]; total: number }> {
  const domain: OdooDomain[] = [
    ["move_type", "=", "out_invoice"],
    ["payment_state", "in", ["not_paid", "partial"]],
    ["state", "=", "posted"],
    ["amount_residual", ">", 0],
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
      amount_due: inv.amount_residual || 0,
      currency: inv.currency_id?.[1] || "USD",
      payment_state: inv.payment_state || "",
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
}

export interface OdooCustomerBalance {
  odoo_partner_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  invoice_count: number;
  total_due: number;
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
}): Promise<{ customers: OdooCustomerBalance[]; total_customers: number; total_due: number }> {
  const domain: OdooDomain[] = [
    ["move_type", "=", "out_invoice"],
    ["payment_state", "in", ["not_paid", "partial"]],
    ["state", "=", "posted"],
    ["amount_residual", ">", 0],
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
    let customerDue = 0;
    let oldestDue = "9999-12-31";
    const currency = data.invoices[0]?.currency_id?.[1] || "VED";

    const invoiceDetails: OdooInvoiceDetail[] = data.invoices.map((inv: any) => {
      customerDue += inv.amount_residual;
      if (inv.invoice_date_due && inv.invoice_date_due < oldestDue) {
        oldestDue = inv.invoice_date_due;
      }
      return {
        id: inv.id,
        invoice_number: inv.name || "",
        invoice_date: inv.invoice_date || "",
        due_date: inv.invoice_date_due || "",
        total: inv.amount_total || 0,
        amount_due: inv.amount_residual || 0,
        currency: inv.currency_id?.[1] || "VED",
        payment_state: inv.payment_state || "",
        products: productsByInvoice.get(inv.id) || [],
      };
    });

    if (options?.minAmount && customerDue < options.minAmount) continue;

    grandTotal += customerDue;
    customers.push({
      odoo_partner_id: pid,
      customer_name: p.name || data.invoices[0]?.partner_id[1] || "",
      customer_email: p.email || "",
      customer_phone: p.mobile || p.phone || "",
      customer_cedula_rif: p.vat || "",
      invoice_count: data.invoices.length,
      total_due: Math.round(customerDue * 100) / 100,
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
