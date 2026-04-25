// ============================================================
// DAL — Collection Campaigns (Cobros Masivos)
// ============================================================

import { createAdminSupabase } from "@/lib/supabase/server";
import crypto from "crypto";

// ---------- Types ----------

export interface CollectionCampaign {
  id: string;
  name: string;
  description: string | null;
  total_items: number;
  total_amount_usd: number;
  items_paid: number;
  amount_collected_usd: number;
  status: "draft" | "sending" | "active" | "completed" | "cancelled";
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CollectionItem {
  id: string;
  campaign_id: string;
  payment_token: string;
  customer_name: string;
  customer_cedula_rif: string;
  customer_email: string | null;
  customer_phone: string | null;
  invoice_number: string | null;
  concept: string | null;
  amount_usd: number;
  amount_bss: number | null;
  bcv_rate: number | null;
  payment_method: "debito_inmediato" | "transferencia" | "stripe" | "paypal" | "c2p" | "cash" | "pending" | null;
  payment_reference: string | null;
  payment_date: string | null;
  status: "pending" | "sent" | "viewed" | "paid" | "failed" | "expired" | "conciliating";
  stripe_session_id: string | null;
  mercantil_reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
}

export interface CollectionNotification {
  id: string;
  item_id: string;
  channel: "whatsapp" | "email";
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  attempt_number: number;
  sent_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

// ---------- Token generation ----------

export function generateCollectionToken(): string {
  return `wpy_${crypto.randomBytes(32).toString("hex")}`;
}

// ---------- Campaigns ----------

export async function getCampaigns(): Promise<CollectionCampaign[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getCampaign(id: string): Promise<CollectionCampaign | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function createCampaign(input: {
  name: string;
  description?: string;
  created_by?: string;
}): Promise<CollectionCampaign> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_campaigns")
    .insert({
      name: input.name,
      description: input.description || null,
      created_by: input.created_by || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCampaign(
  id: string,
  updates: Partial<CollectionCampaign>
): Promise<CollectionCampaign> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_campaigns")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCampaignTotals(campaignId: string): Promise<void> {
  const sb = createAdminSupabase();
  const { data: items } = await sb
    .from("collection_items")
    .select("amount_usd, status")
    .eq("campaign_id", campaignId);

  if (!items) return;

  const total_items = items.length;
  const total_amount_usd = items.reduce((s, i) => s + Number(i.amount_usd), 0);
  const paid = items.filter((i) => i.status === "paid");
  const items_paid = paid.length;
  const amount_collected_usd = paid.reduce((s, i) => s + Number(i.amount_usd), 0);

  await sb
    .from("collection_campaigns")
    .update({ total_items, total_amount_usd, items_paid, amount_collected_usd })
    .eq("id", campaignId);
}

// ---------- Items ----------

export async function getItemsByToken(token: string): Promise<CollectionItem | null> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_items")
    .select("*")
    .eq("payment_token", token)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function getItemsByCampaign(
  campaignId: string,
  filters?: { status?: string; search?: string }
): Promise<CollectionItem[]> {
  const sb = createAdminSupabase();
  let query = sb
    .from("collection_items")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.search) {
    query = query.or(
      `customer_name.ilike.%${filters.search}%,customer_cedula_rif.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createItems(
  campaignId: string,
  rows: Array<{
    customer_name: string;
    customer_cedula_rif: string;
    customer_email?: string;
    customer_phone?: string;
    invoice_number?: string;
    concept?: string;
    amount_usd: number;
    metadata?: Record<string, any>;
  }>
): Promise<CollectionItem[]> {
  const sb = createAdminSupabase();

  const items = rows.map((row) => ({
    campaign_id: campaignId,
    payment_token: generateCollectionToken(),
    customer_name: row.customer_name,
    customer_cedula_rif: row.customer_cedula_rif,
    customer_email: row.customer_email || null,
    customer_phone: row.customer_phone || null,
    invoice_number: row.invoice_number || null,
    concept: row.concept || null,
    amount_usd: row.amount_usd,
    status: "pending" as const,
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }));

  const { data, error } = await sb
    .from("collection_items")
    .insert(items)
    .select();
  if (error) throw error;

  // Update campaign totals
  await updateCampaignTotals(campaignId);

  return data || [];
}

export async function updateItem(
  id: string,
  updates: Partial<CollectionItem>
): Promise<CollectionItem> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markItemPaid(
  token: string,
  payment: {
    payment_method: CollectionItem["payment_method"];
    payment_reference: string;
    amount_bss?: number;
    bcv_rate?: number;
  }
): Promise<CollectionItem> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_items")
    .update({
      status: "paid",
      payment_method: payment.payment_method,
      payment_reference: payment.payment_reference,
      amount_bss: payment.amount_bss || null,
      bcv_rate: payment.bcv_rate || null,
      paid_at: new Date().toISOString(),
      payment_date: new Date().toISOString(),
    })
    .eq("payment_token", token)
    .select()
    .single();
  if (error) throw error;

  // Update campaign totals
  if (data?.campaign_id) {
    await updateCampaignTotals(data.campaign_id);
  }

  return data;
}

// ---------- Notifications ----------

export async function createNotification(input: {
  item_id: string;
  channel: "whatsapp" | "email";
  attempt_number?: number;
}): Promise<CollectionNotification> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_notifications")
    .insert({
      item_id: input.item_id,
      channel: input.channel,
      attempt_number: input.attempt_number || 1,
      status: "queued",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNotification(
  id: string,
  updates: Partial<CollectionNotification>
): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("collection_notifications")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function getNotificationsByItem(itemId: string): Promise<CollectionNotification[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("collection_notifications")
    .select("*")
    .eq("item_id", itemId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getPendingReminders(): Promise<CollectionItem[]> {
  const sb = createAdminSupabase();
  // Items that are sent but not paid, and created more than 48h ago
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("collection_items")
    .select("*, collection_notifications(*)")
    .in("status", ["sent", "viewed"])
    .lt("created_at", cutoff48h);
  if (error) throw error;
  return data || [];
}

// ---------- Delete campaign ----------

export async function deleteCampaign(id: string): Promise<void> {
  const sb = createAdminSupabase();
  // Delete notifications for all items in this campaign
  const { data: items } = await sb
    .from("collection_items")
    .select("id")
    .eq("campaign_id", id);
  if (items && items.length > 0) {
    const itemIds = items.map((i) => i.id);
    await sb.from("collection_notifications").delete().in("item_id", itemIds);
  }
  // Delete items
  await sb.from("collection_items").delete().eq("campaign_id", id);
  // Delete campaign
  const { error } = await sb.from("collection_campaigns").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Duplicate detection ----------

export async function findDuplicateItems(
  identifiers: Array<{ email?: string; cedula_rif?: string }>
): Promise<Array<{ email?: string; cedula_rif?: string; campaign_name: string; campaign_id: string; status: string }>> {
  const sb = createAdminSupabase();

  // Get all items from active campaigns (not paid, not cancelled)
  const { data: campaigns } = await sb
    .from("collection_campaigns")
    .select("id, name")
    .in("status", ["draft", "sending", "active"]);
  if (!campaigns || campaigns.length === 0) return [];

  const campaignIds = campaigns.map((c) => c.id);
  const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));

  const { data: existingItems } = await sb
    .from("collection_items")
    .select("customer_email, customer_cedula_rif, campaign_id, status")
    .in("campaign_id", campaignIds)
    .not("status", "in", '("paid","expired","cancelled")');
  if (!existingItems) return [];

  const duplicates: Array<{ email?: string; cedula_rif?: string; campaign_name: string; campaign_id: string; status: string }> = [];

  for (const ident of identifiers) {
    for (const existing of existingItems) {
      const matchEmail = ident.email && existing.customer_email &&
        ident.email.toLowerCase() === existing.customer_email.toLowerCase();
      const matchCedula = ident.cedula_rif && existing.customer_cedula_rif &&
        ident.cedula_rif.toUpperCase() === existing.customer_cedula_rif.toUpperCase();

      if (matchEmail || matchCedula) {
        duplicates.push({
          email: ident.email,
          cedula_rif: ident.cedula_rif,
          campaign_name: campaignMap.get(existing.campaign_id) || "Desconocida",
          campaign_id: existing.campaign_id,
          status: existing.status,
        });
        break; // One match per identifier is enough
      }
    }
  }

  return duplicates;
}
