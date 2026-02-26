// ============================================
// CRM Cobranzas - Data Access Layer
// ============================================
import { createAdminSupabase } from "@/lib/supabase/server";
import { updateClient, nextSequence } from "./facturacion";

const supabase = () => createAdminSupabase();

// ============================================
// STAGES CONFIG
// ============================================
export const COLLECTION_STAGES = [
  "leads_entrantes", "contacto_inicial", "info_enviada", "no_clasificado",
  "gestion_suspendidos", "gestion_pre_retiro", "gestion_cobranza",
  "recuperado", "retirado_definitivo",
] as const;

export type CollectionStage = typeof COLLECTION_STAGES[number];

// ============================================
// COLLECTIONS
// ============================================

export async function getCollections(options?: {
  search?: string;
  stage?: string;
  collector_id?: string;
  days_overdue_min?: number;
  days_overdue_max?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("crm_collections")
    .select("*, crm_collectors(id, full_name, type)", { count: "exact" })
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.stage) query = query.eq("stage", options.stage);
  if (options?.collector_id) query = query.eq("collector_id", options.collector_id);
  if (options?.days_overdue_min !== undefined) query = query.gte("days_overdue", options.days_overdue_min);
  if (options?.days_overdue_max !== undefined) query = query.lte("days_overdue", options.days_overdue_max);
  if (options?.date_from) query = query.gte("created_at", options.date_from);
  if (options?.date_to) query = query.lte("created_at", options.date_to);
  if (options?.search) {
    query = query.or(
      `client_name.ilike.%${options.search}%,code.ilike.%${options.search}%,client_phone.ilike.%${options.search}%,client_email.ilike.%${options.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}

export async function getCollection(id: string) {
  const { data, error } = await supabase()
    .from("crm_collections")
    .select("*, crm_collectors(id, full_name, type, email, phone)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCollectionDetail(id: string) {
  const collection = await getCollection(id);

  const { data: activities } = await supabase()
    .from("crm_collection_activities")
    .select("*")
    .eq("collection_id", id)
    .order("created_at", { ascending: false });

  return { ...collection, activities: activities || [] };
}

export async function createCollection(collectionData: any) {
  const code = await nextSequence("collection");
  const { data, error } = await supabase()
    .from("crm_collections")
    .insert({ ...collectionData, code, stage_changed_at: new Date().toISOString() })
    .select("*, crm_collectors(id, full_name, type)")
    .single();
  if (error) throw new Error(error.message);

  // Create initial activity
  await createActivity({
    collection_id: data.id,
    type: "system",
    description: `Caso de cobranza ${code} creado`,
    created_by: "Sistema",
  });

  return data;
}

export async function updateCollection(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("crm_collections")
    .update(updates)
    .eq("id", id)
    .select("*, crm_collectors(id, full_name, type)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function moveCollection(id: string, newStage: string, userName?: string) {
  const collection = await getCollection(id);
  if (!collection) throw new Error("Caso de cobranza no encontrado");

  const oldStage = collection.stage;
  if (oldStage === newStage) return collection;

  const updateData: any = {
    stage: newStage,
    stage_changed_at: new Date().toISOString(),
  };

  if (newStage === "recuperado") {
    updateData.recovered_at = new Date().toISOString();
  }
  if (newStage === "retirado_definitivo") {
    updateData.retired_at = new Date().toISOString();
  }

  // Update stage
  const { data: updated, error } = await supabase()
    .from("crm_collections")
    .update(updateData)
    .eq("id", id)
    .select("*, crm_collectors(id, full_name, type)")
    .single();
  if (error) throw new Error(error.message);

  // Log stage change activity
  await createActivity({
    collection_id: id,
    type: "stage_change",
    description: `Etapa cambiada`,
    metadata: { from_stage: oldStage, to_stage: newStage },
    created_by: userName || "Sistema",
  });

  // Client status changes on terminal stages
  if (newStage === "recuperado" && collection.client_id) {
    await updateClient(collection.client_id, { service_status: "active" });
    await createActivity({
      collection_id: id,
      type: "system",
      description: "Cliente reactivado automáticamente",
      created_by: "Sistema",
    });
  }

  if (newStage === "retirado_definitivo" && collection.client_id) {
    await updateClient(collection.client_id, { service_status: "cancelled" });
    await createActivity({
      collection_id: id,
      type: "system",
      description: "Cliente marcado como cancelado",
      created_by: "Sistema",
    });
  }

  return updated;
}

export async function deleteCollection(id: string) {
  const { error } = await supabase()
    .from("crm_collections")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================
// ACTIVITIES
// ============================================

export async function getActivities(collectionId: string) {
  const { data, error } = await supabase()
    .from("crm_collection_activities")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createActivity(activity: {
  collection_id: string;
  type: string;
  description: string;
  metadata?: any;
  created_by?: string;
}) {
  const { data, error } = await supabase()
    .from("crm_collection_activities")
    .insert(activity)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// COLLECTORS
// ============================================

export async function getCollectors(options?: {
  search?: string;
  type?: string;
  active_only?: boolean;
}) {
  let query = supabase()
    .from("crm_collectors")
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

export async function createCollector(collector: any) {
  const { data, error } = await supabase()
    .from("crm_collectors")
    .insert(collector)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCollector(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("crm_collectors")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCollector(id: string) {
  const { error } = await supabase()
    .from("crm_collectors")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================
// QUOTAS
// ============================================

export async function getQuotas(month: string) {
  const { data, error } = await supabase()
    .from("crm_collection_quotas")
    .select("*, crm_collectors(id, full_name, type)")
    .eq("month", month)
    .order("crm_collectors(full_name)");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertQuota(quota: {
  collector_id: string;
  month: string;
  target_count?: number;
  target_amount?: number;
}) {
  const { data, error } = await supabase()
    .from("crm_collection_quotas")
    .upsert(quota, { onConflict: "collector_id,month" })
    .select("*, crm_collectors(id, full_name)")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getQuotaProgress(month: string) {
  const quotas = await getQuotas(month);

  // Calculate start/end of month for recovered_at filtering
  const monthDate = new Date(month);
  const startOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).toISOString();
  const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Get recovered collections per collector in this month
  const { data: recoveredCases } = await supabase()
    .from("crm_collections")
    .select("collector_id, amount_paid")
    .eq("stage", "recuperado")
    .eq("is_deleted", false)
    .gte("recovered_at", startOfMonth)
    .lte("recovered_at", endOfMonth);

  // Aggregate by collector
  const byCollector = new Map<string, { count: number; amount: number }>();
  for (const c of recoveredCases || []) {
    if (!c.collector_id) continue;
    const current = byCollector.get(c.collector_id) || { count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(c.amount_paid || 0);
    byCollector.set(c.collector_id, current);
  }

  return quotas.map((q: any) => {
    const actual = byCollector.get(q.collector_id) || { count: 0, amount: 0 };
    return {
      ...q,
      actual_count: actual.count,
      actual_amount: actual.amount,
      pct_count: q.target_count > 0 ? Math.round((actual.count / q.target_count) * 100) : 0,
      pct_amount: q.target_amount > 0 ? Math.round((actual.amount / q.target_amount) * 100) : 0,
    };
  });
}
