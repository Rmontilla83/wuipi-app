// ============================================
// CRM Ventas - Data Access Layer
// ============================================
import { createAdminSupabase } from "@/lib/supabase/server";
import { createClient } from "./facturacion";
import { nextSequence } from "./facturacion";

const supabase = () => createAdminSupabase();

// ============================================
// STAGES CONFIG
// ============================================
export const CRM_STAGES = [
  "incoming", "contacto_inicial", "info_enviada", "en_instalacion",
  "no_factible", "no_concretado", "no_clasificado",
  "retirado_reactivacion", "prueba_actualizacion", "ganado",
] as const;

export type CrmStage = typeof CRM_STAGES[number];

// ============================================
// LEADS
// ============================================

export async function getLeads(options?: {
  search?: string;
  stage?: string;
  salesperson_id?: string;
  product_id?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("crm_leads")
    .select("*, crm_products(id, name, category), crm_salespeople(id, full_name, type)", { count: "exact" })
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.stage) query = query.eq("stage", options.stage);
  if (options?.salesperson_id) query = query.eq("salesperson_id", options.salesperson_id);
  if (options?.product_id) query = query.eq("product_id", options.product_id);
  if (options?.source) query = query.eq("source", options.source);
  if (options?.date_from) query = query.gte("created_at", options.date_from);
  if (options?.date_to) query = query.lte("created_at", options.date_to);
  if (options?.search) {
    query = query.or(
      `name.ilike.%${options.search}%,code.ilike.%${options.search}%,phone.ilike.%${options.search}%,email.ilike.%${options.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getLead(id: string) {
  const { data, error } = await supabase()
    .from("crm_leads")
    .select("*, crm_products(id, name, category, base_price), crm_salespeople(id, full_name, type, email, phone)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLeadDetail(id: string) {
  const lead = await getLead(id);

  const { data: activities } = await supabase()
    .from("crm_lead_activities")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  return { ...lead, activities: activities || [] };
}

export async function createLead(leadData: any) {
  const code = await nextSequence("lead");
  const { data, error } = await supabase()
    .from("crm_leads")
    .insert({ ...leadData, code, stage_changed_at: new Date().toISOString() })
    .select("*, crm_products(id, name, category), crm_salespeople(id, full_name, type)")
    .single();
  if (error) throw new Error(error.message);

  // Create initial activity
  await createActivity({
    lead_id: data.id,
    type: "system",
    description: `Lead ${code} creado`,
    created_by: "Sistema",
  });

  return data;
}

export async function updateLead(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("crm_leads")
    .update(updates)
    .eq("id", id)
    .select("*, crm_products(id, name, category), crm_salespeople(id, full_name, type)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function moveLead(id: string, newStage: string, userName?: string) {
  const lead = await getLead(id);
  if (!lead) throw new Error("Lead no encontrado");

  const oldStage = lead.stage;
  if (oldStage === newStage) return lead;

  const updateData: any = {
    stage: newStage,
    stage_changed_at: new Date().toISOString(),
  };

  if (newStage === "no_concretado") {
    updateData.lost_at = new Date().toISOString();
  }

  // Update stage first
  const { data: updated, error } = await supabase()
    .from("crm_leads")
    .update(updateData)
    .eq("id", id)
    .select("*, crm_products(id, name, category), crm_salespeople(id, full_name, type)")
    .single();
  if (error) throw new Error(error.message);

  // Log stage change activity
  await createActivity({
    lead_id: id,
    type: "stage_change",
    description: `Etapa cambiada`,
    metadata: { from_stage: oldStage, to_stage: newStage },
    created_by: userName || "Sistema",
  });

  // Auto-create client on "ganado"
  if (newStage === "ganado") {
    await autoCreateClient(id);
  }

  return updated;
}

export async function deleteLead(id: string) {
  const { error } = await supabase()
    .from("crm_leads")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function autoCreateClient(leadId: string) {
  const lead = await getLead(leadId);
  if (!lead) return;
  if (lead.client_id) return; // already linked

  const client = await createClient({
    legal_name: lead.name,
    document_type: lead.document_type || "V",
    document_number: lead.document_number || "000",
    email: lead.email || null,
    phone: lead.phone || null,
    phone_alt: lead.phone_alt || null,
    address: lead.address || null,
    city: lead.city || null,
    state: lead.state || null,
    sector: lead.sector || null,
    nodo: lead.nodo || null,
    service_status: "pending",
    billing_currency: "USD",
    notes: `Auto-creado desde CRM lead ${lead.code}`,
  });

  // Link client to lead and set won_at
  await supabase()
    .from("crm_leads")
    .update({ client_id: client.id, won_at: new Date().toISOString() })
    .eq("id", leadId);

  await createActivity({
    lead_id: leadId,
    type: "system",
    description: `Cliente ${client.code} creado automáticamente`,
    metadata: { client_id: client.id, client_code: client.code },
    created_by: "Sistema",
  });
}

// ============================================
// ACTIVITIES
// ============================================

export async function getActivities(leadId: string) {
  const { data, error } = await supabase()
    .from("crm_lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createActivity(activity: {
  lead_id: string;
  type: string;
  description: string;
  metadata?: any;
  created_by?: string;
}) {
  const { data, error } = await supabase()
    .from("crm_lead_activities")
    .insert(activity)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// SALESPEOPLE
// ============================================

export async function getSalespeople(options?: {
  search?: string;
  type?: string;
  active_only?: boolean;
}) {
  let query = supabase()
    .from("crm_salespeople")
    .select("*")
    .order("full_name");

  if (options?.active_only !== false) query = query.eq("is_active", true);
  if (options?.type) query = query.eq("type", options.type);
  if (options?.search) {
    query = query.or(`full_name.ilike.%${options.search}%,email.ilike.%${options.search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createSalesperson(sp: any) {
  const { data, error } = await supabase()
    .from("crm_salespeople")
    .insert(sp)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSalesperson(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("crm_salespeople")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSalesperson(id: string) {
  const { error } = await supabase()
    .from("crm_salespeople")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================
// PRODUCTS
// ============================================

export async function getProducts(activeOnly = true) {
  let query = supabase()
    .from("crm_products")
    .select("*")
    .order("sort_order");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createProduct(product: any) {
  const { data, error } = await supabase()
    .from("crm_products")
    .insert(product)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProduct(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("crm_products")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// QUOTAS
// ============================================

export async function getQuotas(month: string) {
  const { data, error } = await supabase()
    .from("crm_quotas")
    .select("*, crm_salespeople(id, full_name, type)")
    .eq("month", month)
    .order("crm_salespeople(full_name)");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertQuota(quota: {
  salesperson_id: string;
  month: string;
  target_count: number;
  target_amount: number;
}) {
  const { data, error } = await supabase()
    .from("crm_quotas")
    .upsert(quota, { onConflict: "salesperson_id,month" })
    .select("*, crm_salespeople(id, full_name)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getQuotaProgress(month: string) {
  // Get all quotas for this month
  const quotas = await getQuotas(month);

  // Calculate start/end of month for won_at filtering
  const monthDate = new Date(month);
  const startOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString();
  const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Get won leads per salesperson in this month
  const { data: wonLeads } = await supabase()
    .from("crm_leads")
    .select("salesperson_id, value")
    .eq("stage", "ganado")
    .eq("is_deleted", false)
    .gte("won_at", startOfMonth)
    .lte("won_at", endOfMonth);

  // Aggregate by salesperson
  const wonBySp = new Map<string, { count: number; amount: number }>();
  for (const lead of wonLeads || []) {
    if (!lead.salesperson_id) continue;
    const current = wonBySp.get(lead.salesperson_id) || { count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(lead.value || 0);
    wonBySp.set(lead.salesperson_id, current);
  }

  return quotas.map((q: any) => {
    const actual = wonBySp.get(q.salesperson_id) || { count: 0, amount: 0 };
    return {
      ...q,
      actual_count: actual.count,
      actual_amount: actual.amount,
      pct_count: q.target_count > 0 ? Math.round((actual.count / q.target_count) * 100) : 0,
      pct_amount: q.target_amount > 0 ? Math.round((actual.amount / q.target_amount) * 100) : 0,
    };
  });
}
