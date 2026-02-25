// ============================================
// Facturación - Data Access Layer
// ============================================
import { createAdminSupabase } from "@/lib/supabase/server";

const supabase = () => createAdminSupabase();

// --- Helpers ---

export async function nextSequence(seqId: string): Promise<string> {
  const { data, error } = await supabase().rpc("next_sequence", {
    seq_id: seqId,
    seq_prefix: null,
  });
  if (error) throw new Error(`Sequence error: ${error.message}`);
  return data as string;
}

// --- CLIENTS ---

export async function getClients(options?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("clients")
    .select("*, plans(code, name, price_usd)", { count: "exact" })
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.status) query = query.eq("service_status", options.status);
  if (options?.search) {
    query = query.or(
      `legal_name.ilike.%${options.search}%,trade_name.ilike.%${options.search}%,code.ilike.%${options.search}%,document_number.ilike.%${options.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getClient(id: string) {
  const { data, error } = await supabase()
    .from("clients")
    .select("*, plans(code, name, price_usd, speed_down, speed_up, technology)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createClient(client: any) {
  const code = await nextSequence("client");
  const { data, error } = await supabase()
    .from("clients")
    .insert({ ...client, code })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateClient(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteClient(id: string) {
  const { error } = await supabase()
    .from("clients")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// --- CLIENT DETAIL (ficha integral) ---

export async function getClientDetail(id: string) {
  // Get client with plan
  const { data: client, error } = await supabase()
    .from("clients")
    .select("*, plans(id, code, name, price_usd, speed_down, speed_up, technology)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  // Get invoices
  const { data: invoices } = await supabase()
    .from("invoices")
    .select("id, invoice_number, issue_date, due_date, currency, total, amount_paid, balance_due, status")
    .eq("client_id", id)
    .order("issue_date", { ascending: false })
    .limit(20);

  // Get payments
  const { data: payments } = await supabase()
    .from("payments")
    .select("id, payment_number, payment_date, amount, currency, status, reference_number, payment_methods(name)")
    .eq("client_id", id)
    .order("payment_date", { ascending: false })
    .limit(20);

  // Calculate billing summary
  const allInvoices = invoices || [];
  const allPayments = payments || [];
  const totalInvoiced = allInvoices.reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const totalPaid = allPayments.filter((p: any) => p.status === "confirmed").reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const totalOverdue = allInvoices.filter((i: any) => i.status === "overdue").reduce((s: number, i: any) => s + Number(i.balance_due || 0), 0);

  return {
    ...client,
    invoices: allInvoices,
    payments: allPayments,
    billing_summary: {
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      total_overdue: totalOverdue,
      balance: totalInvoiced - totalPaid,
      invoice_count: allInvoices.length,
      payment_count: allPayments.length,
    },
  };
}

// --- PLANS ---

export async function getPlans(activeOnly = true) {
  let query = supabase().from("plans").select("*").order("price_usd", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createPlan(plan: any) {
  const { data, error } = await supabase().from("plans").insert(plan).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePlan(id: string, updates: any) {
  const { data, error } = await supabase().from("plans").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// --- SERVICES ---

export async function getServices(activeOnly = true) {
  let query = supabase().from("services").select("*").order("category").order("name");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createService(service: any) {
  const { data, error } = await supabase().from("services").insert(service).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateService(id: string, updates: any) {
  const { data, error } = await supabase().from("services").update(updates).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// --- INVOICES ---

export async function getInvoices(options?: {
  search?: string;
  status?: string;
  clientId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("invoices")
    .select("*, clients!inner(code, legal_name, trade_name)", { count: "exact" })
    .eq("is_deleted", false)
    .order("issue_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.status) query = query.eq("status", options.status);
  if (options?.clientId) query = query.eq("client_id", options.clientId);
  if (options?.from) query = query.gte("issue_date", options.from);
  if (options?.to) query = query.lte("issue_date", options.to);
  if (options?.search) {
    query = query.or(
      `invoice_number.ilike.%${options.search}%,client_name.ilike.%${options.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getInvoice(id: string) {
  const { data, error } = await supabase()
    .from("invoices")
    .select("*, invoice_items(*), clients(code, legal_name, trade_name, email, phone)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createInvoice(invoice: any, items: any[]) {
  const db = supabase();
  
  // Get next invoice number
  const invoiceNumber = await nextSequence(
    invoice.invoice_type === "credit_note" ? "credit_note" : "invoice"
  );

  // Get client snapshot
  const client = await getClient(invoice.client_id);

  // Calculate IGTF
  const igtfPct = invoice.currency !== "VES" ? 3.0 : 0;

  // Insert invoice
  const { data: inv, error: invError } = await db
    .from("invoices")
    .insert({
      ...invoice,
      invoice_number: invoiceNumber,
      client_name: client.legal_name,
      client_document: `${client.document_type}-${client.document_number}`,
      client_address: client.address,
      tax_igtf_pct: igtfPct,
      status: "draft",
    })
    .select()
    .single();

  if (invError) throw new Error(invError.message);

  // Insert items
  if (items.length > 0) {
    const itemsWithInvoice = items.map((item, i) => ({
      ...item,
      invoice_id: inv.id,
      subtotal: item.quantity * item.unit_price,
      tax_amount: item.taxable !== false
        ? Math.round(item.quantity * item.unit_price * (item.tax_rate || 16) / 100 * 100) / 100
        : 0,
      total: item.taxable !== false
        ? Math.round(item.quantity * item.unit_price * (1 + (item.tax_rate || 16) / 100) * 100) / 100
        : item.quantity * item.unit_price,
      sort_order: i,
    }));

    const { error: itemsError } = await db.from("invoice_items").insert(itemsWithInvoice);
    if (itemsError) throw new Error(itemsError.message);
  }

  // Return full invoice
  return getInvoice(inv.id);
}

export async function updateInvoice(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("invoices")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteInvoice(id: string) {
  const { error } = await supabase()
    .from("invoices")
    .update({ is_deleted: true, status: "void" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// --- INVOICE ITEMS ---

export async function addInvoiceItem(item: any) {
  const { data, error } = await supabase()
    .from("invoice_items")
    .insert({
      ...item,
      subtotal: item.quantity * item.unit_price,
      tax_amount: item.taxable !== false
        ? Math.round(item.quantity * item.unit_price * (item.tax_rate || 16) / 100 * 100) / 100
        : 0,
      total: item.taxable !== false
        ? Math.round(item.quantity * item.unit_price * (1 + (item.tax_rate || 16) / 100) * 100) / 100
        : item.quantity * item.unit_price,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeInvoiceItem(id: string) {
  const { error } = await supabase().from("invoice_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// --- PAYMENTS ---

export async function getPayments(options?: {
  search?: string;
  status?: string;
  clientId?: string;
  invoiceId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("payments")
    .select("*, clients(code, legal_name), invoices(invoice_number), payment_methods(name, code)", { count: "exact" })
    .order("payment_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.status) query = query.eq("status", options.status);
  if (options?.clientId) query = query.eq("client_id", options.clientId);
  if (options?.invoiceId) query = query.eq("invoice_id", options.invoiceId);
  if (options?.from) query = query.gte("payment_date", options.from);
  if (options?.to) query = query.lte("payment_date", options.to);
  if (options?.search) {
    query = query.or(
      `payment_number.ilike.%${options.search}%,reference_number.ilike.%${options.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function createPayment(payment: any) {
  const paymentNumber = await nextSequence("payment");
  const { data, error } = await supabase()
    .from("payments")
    .insert({ ...payment, payment_number: paymentNumber })
    .select("*, clients(code, legal_name), invoices(invoice_number), payment_methods(name, code)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updatePayment(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("payments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// --- PAYMENT METHODS ---

export async function getPaymentMethods() {
  const { data, error } = await supabase()
    .from("payment_methods")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data || [];
}

// --- EXCHANGE RATES ---

export async function getLatestRate(from = "USD", to = "VES") {
  const { data, error } = await supabase()
    .from("exchange_rates")
    .select("*")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .order("effective_date", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data;
}

export async function setExchangeRate(rate: { from_currency: string; to_currency: string; rate: number; source?: string }) {
  const { data, error } = await supabase()
    .from("exchange_rates")
    .upsert({
      ...rate,
      effective_date: new Date().toISOString().split("T")[0],
      source: rate.source || "manual",
    }, { onConflict: "from_currency,to_currency,effective_date,source" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// --- DASHBOARD STATS ---

export async function getFacturacionStats() {
  const db = supabase();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  // Parallel queries
  const [
    { count: totalClients },
    { count: activeClients },
    { data: invoicesThisMonth },
    { data: overdueInvoices },
    { data: paymentsThisMonth },
    { data: pendingPayments },
  ] = await Promise.all([
    db.from("clients").select("*", { count: "exact", head: true }).eq("is_deleted", false),
    db.from("clients").select("*", { count: "exact", head: true }).eq("is_deleted", false).eq("service_status", "active"),
    db.from("invoices").select("total, status, currency").eq("is_deleted", false).gte("issue_date", startOfMonth),
    db.from("invoices").select("id, invoice_number, client_name, total, due_date, balance_due, currency")
      .eq("is_deleted", false).in("status", ["sent", "partial"]).lt("due_date", today).order("due_date").limit(20),
    db.from("payments").select("amount, currency, status").eq("status", "confirmed").gte("payment_date", startOfMonth),
    db.from("payments").select("id").eq("status", "pending"),
  ]);

  // Calculate totals
  const invoicedUSD = (invoicesThisMonth || [])
    .filter(i => i.currency === "USD")
    .reduce((sum, i) => sum + (i.total || 0), 0);
  const invoicedVES = (invoicesThisMonth || [])
    .filter(i => i.currency === "VES")
    .reduce((sum, i) => sum + (i.total || 0), 0);
  const collectedUSD = (paymentsThisMonth || [])
    .filter(p => p.currency === "USD")
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const collectedVES = (paymentsThisMonth || [])
    .filter(p => p.currency === "VES")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const paidCount = (invoicesThisMonth || []).filter(i => i.status === "paid").length;
  const totalInvCount = (invoicesThisMonth || []).length;

  return {
    total_clients: totalClients || 0,
    active_clients: activeClients || 0,
    invoiced_usd: invoicedUSD,
    invoiced_ves: invoicedVES,
    invoices_this_month: totalInvCount,
    invoices_paid: paidCount,
    collected_usd: collectedUSD,
    collected_ves: collectedVES,
    overdue_invoices: overdueInvoices || [],
    overdue_count: (overdueInvoices || []).length,
    overdue_total_usd: (overdueInvoices || [])
      .filter(i => i.currency === "USD")
      .reduce((sum, i) => sum + (i.balance_due || 0), 0),
    pending_payments: (pendingPayments || []).length,
    collection_rate: totalInvCount > 0 ? Math.round((paidCount / totalInvCount) * 100) : 0,
  };
}
