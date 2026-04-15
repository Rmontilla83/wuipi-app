// ===========================================
// WUIPI APP — Inbox Multi-Canal Types
// ===========================================

// --- Enums ---

export type InboxChannel = "whatsapp" | "instagram" | "facebook" | "web" | "manual";
export type ConversationStatus = "active" | "bot" | "waiting" | "resolved" | "expired";
export type MessageDirection = "inbound" | "outbound";
export type SenderType = "contact" | "agent" | "bot" | "system";
export type MessageContentType = "text" | "image" | "video" | "audio" | "document" | "location" | "system";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "simulated";
export type BotTemperature = "frio" | "tibio" | "caliente";

// --- Entities ---

export interface InboxContact {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  wa_id: string | null;
  ig_id: string | null;
  fb_id: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InboxConversation {
  id: string;
  contact_id: string;
  lead_id: string | null;
  channel: InboxChannel;
  status: ConversationStatus;
  assigned_to: string | null;
  bot_active: boolean;
  unread_count: number;
  last_message_at: string;
  last_message_preview: string | null;
  temperature: BotTemperature;
  bot_fields: Record<string, unknown>;
  on_hold_reason: string | null;
  on_hold_until: string | null;
  on_hold_by: string | null;
  followup_count: number;
  last_followup_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Joined relations (optional)
  crm_contacts?: InboxContact;
  crm_leads?: { id: string; code: string; name: string; stage: string } | null;
  crm_salespeople?: { id: string; full_name: string } | null;
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  sender_id: string | null;
  content: string;
  content_type: MessageContentType;
  media_url: string | null;
  status: MessageStatus;
  platform_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// --- UI Config ---

export const CHANNEL_CONFIG: Record<InboxChannel, { label: string; icon: string; color: string; bg: string }> = {
  whatsapp:  { label: "WhatsApp",  icon: "MessageCircle", color: "text-green-400",  bg: "bg-green-500/10" },
  instagram: { label: "Instagram", icon: "Instagram",     color: "text-pink-400",   bg: "bg-pink-500/10" },
  facebook:  { label: "Facebook",  icon: "Facebook",      color: "text-blue-400",   bg: "bg-blue-500/10" },
  web:       { label: "Web",       icon: "Globe",         color: "text-gray-400",   bg: "bg-gray-500/10" },
  manual:    { label: "Manual",    icon: "PenLine",       color: "text-yellow-400", bg: "bg-yellow-500/10" },
};

export const CONVERSATION_STATUS_CONFIG: Record<ConversationStatus, { label: string; color: string; bg: string }> = {
  active:   { label: "Activa",    color: "text-emerald-400", bg: "bg-emerald-500/10" },
  bot:      { label: "Bot",       color: "text-cyan-400",    bg: "bg-cyan-500/10" },
  waiting:  { label: "Requiere atención", color: "text-red-400", bg: "bg-red-500/15" },
  resolved: { label: "Resuelta",  color: "text-gray-400",    bg: "bg-gray-500/10" },
  expired:  { label: "Expirada",  color: "text-red-400",     bg: "bg-red-500/10" },
};
