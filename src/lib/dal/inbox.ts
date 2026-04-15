// ============================================
// Inbox Multi-Canal - Data Access Layer
// ============================================
import { createAdminSupabase } from "@/lib/supabase/server";
import type {
  InboxChannel,
  InboxContact,
  InboxConversation,
  InboxMessage,
} from "@/types/inbox";

const supabase = () => createAdminSupabase();

// ============================================
// CONTACTS
// ============================================

export async function getContacts(options?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("crm_contacts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.search) {
    const s = options.search.replace(/[%_\\]/g, "");
    query = query.or(
      `display_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { data: (data || []) as InboxContact[], total: count || 0, page, limit };
}

export async function getContact(id: string): Promise<InboxContact | null> {
  const { data, error } = await supabase()
    .from("crm_contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InboxContact | null;
}

export async function findContactByChannel(
  channel: InboxChannel,
  channelId: string
): Promise<InboxContact | null> {
  const columnMap: Record<string, string> = {
    whatsapp: "wa_id",
    instagram: "ig_id",
    facebook: "fb_id",
  };
  const column = columnMap[channel];

  // For whatsapp, also try matching by phone
  if (channel === "whatsapp") {
    const { data, error } = await supabase()
      .from("crm_contacts")
      .select("*")
      .or(`wa_id.eq.${channelId},phone.eq.${channelId}`)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as InboxContact | null;
  }

  if (!column) return null;

  const { data, error } = await supabase()
    .from("crm_contacts")
    .select("*")
    .eq(column, channelId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InboxContact | null;
}

export async function createContact(input: {
  display_name: string;
  phone?: string | null;
  email?: string | null;
  wa_id?: string | null;
  ig_id?: string | null;
  fb_id?: string | null;
  avatar_url?: string | null;
}): Promise<InboxContact> {
  const { data, error } = await supabase()
    .from("crm_contacts")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InboxContact;
}

export async function updateContact(
  id: string,
  updates: Partial<Omit<InboxContact, "id" | "created_at" | "updated_at">>
): Promise<InboxContact> {
  const { data, error } = await supabase()
    .from("crm_contacts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InboxContact;
}

// ============================================
// CONVERSATIONS
// ============================================

const CONVERSATION_SELECT =
  "*, crm_contacts(*), crm_leads(id, code, name, stage), crm_salespeople(id, full_name)";

export async function getConversations(options?: {
  assigned_to?: string;
  status?: string;
  channel?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = options?.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("inbox_conversations")
    .select(CONVERSATION_SELECT, { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.assigned_to) query = query.eq("assigned_to", options.assigned_to);
  if (options?.status) query = query.eq("status", options.status);
  if (options?.channel) query = query.eq("channel", options.channel);
  // Search by contact name requires a join filter
  if (options?.search) {
    const s = options.search.replace(/[%_\\]/g, "");
    query = query.ilike("crm_contacts.display_name", `%${s}%`);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return {
    data: (data || []) as InboxConversation[],
    total: count || 0,
    page,
    limit,
  };
}

export async function getConversation(id: string): Promise<InboxConversation | null> {
  const { data, error } = await supabase()
    .from("inbox_conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as InboxConversation | null;
}

export async function createConversation(input: {
  contact_id: string;
  lead_id?: string | null;
  channel: InboxChannel;
  assigned_to?: string | null;
  bot_active?: boolean;
}): Promise<InboxConversation> {
  const { data, error } = await supabase()
    .from("inbox_conversations")
    .insert({
      contact_id: input.contact_id,
      lead_id: input.lead_id || null,
      channel: input.channel,
      assigned_to: input.assigned_to || null,
      bot_active: input.bot_active ?? true,
      status: input.bot_active !== false ? "bot" : "active",
    })
    .select(CONVERSATION_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as InboxConversation;
}

export async function updateConversation(
  id: string,
  updates: {
    status?: string;
    assigned_to?: string | null;
    bot_active?: boolean;
    lead_id?: string | null;
    temperature?: string;
    bot_fields?: Record<string, unknown>;
    unread_count?: number;
    last_message_at?: string;
    last_message_preview?: string;
    on_hold_reason?: string | null;
    on_hold_until?: string | null;
    on_hold_by?: string | null;
    followup_count?: number;
    last_followup_at?: string | null;
  }
): Promise<InboxConversation> {
  const { data, error } = await supabase()
    .from("inbox_conversations")
    .update(updates)
    .eq("id", id)
    .select(CONVERSATION_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as InboxConversation;
}

export async function getOrCreateConversation(
  contactId: string,
  channel: InboxChannel,
  leadId?: string | null
): Promise<InboxConversation> {
  // Look for an active or bot conversation for this contact+channel
  const { data: existing } = await supabase()
    .from("inbox_conversations")
    .select(CONVERSATION_SELECT)
    .eq("contact_id", contactId)
    .eq("channel", channel)
    .in("status", ["active", "bot", "waiting"])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as InboxConversation;

  return createConversation({
    contact_id: contactId,
    lead_id: leadId,
    channel,
  });
}

// ============================================
// MESSAGES
// ============================================

export async function getMessages(
  conversationId: string,
  options?: { before?: string; limit?: number }
): Promise<InboxMessage[]> {
  const limit = options?.limit || 50;

  let query = supabase()
    .from("inbox_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  // Cursor-based pagination: fetch messages before a given timestamp
  if (options?.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as InboxMessage[];
}

export async function createMessage(input: {
  conversation_id: string;
  direction: string;
  sender_type: string;
  sender_id?: string | null;
  content: string;
  content_type?: string;
  media_url?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
}): Promise<InboxMessage> {
  const { data, error } = await supabase()
    .from("inbox_messages")
    .insert({
      conversation_id: input.conversation_id,
      direction: input.direction,
      sender_type: input.sender_type,
      sender_id: input.sender_id || null,
      content: input.content,
      content_type: input.content_type || "text",
      media_url: input.media_url || null,
      status: input.status || "simulated",
      metadata: input.metadata || {},
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Update conversation metadata
  const preview = input.content.length > 100
    ? input.content.slice(0, 100) + "…"
    : input.content;

  const convUpdate: Record<string, unknown> = {
    last_message_at: data.created_at,
    last_message_preview: preview,
  };

  // Increment unread count for inbound messages
  if (input.direction === "inbound") {
    const { data: conv } = await supabase()
      .from("inbox_conversations")
      .select("unread_count")
      .eq("id", input.conversation_id)
      .single();
    convUpdate.unread_count = (conv?.unread_count || 0) + 1;
  }

  await supabase()
    .from("inbox_conversations")
    .update(convUpdate)
    .eq("id", input.conversation_id);

  return data as InboxMessage;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase()
    .from("inbox_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}
