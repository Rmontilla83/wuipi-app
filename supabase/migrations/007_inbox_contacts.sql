-- ============================================
-- WUIPI APP — Multi-Channel Inbox Schema
-- Run after: 006_portal_tables.sql
-- ============================================

-- ============================================
-- 1. CRM CONTACTS (channel-agnostic identity)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255),
  wa_id VARCHAR(50),       -- WhatsApp phone ID (E.164)
  ig_id VARCHAR(100),      -- Instagram scoped user ID
  fb_id VARCHAR(100),      -- Facebook page-scoped user ID
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique parciales — solo aplican si el campo no es NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_wa ON crm_contacts(wa_id) WHERE wa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_ig ON crm_contacts(ig_id) WHERE ig_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_fb ON crm_contacts(fb_id) WHERE fb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts(phone);

CREATE TRIGGER crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 2. FK en crm_leads (nullable, backward-compatible)
-- ============================================
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_contact ON crm_leads(contact_id);

-- ============================================
-- 3. INBOX CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp','instagram','facebook','web','manual')),
  status VARCHAR(20) NOT NULL DEFAULT 'bot'
    CHECK (status IN ('active','bot','waiting','resolved','expired')),
  assigned_to UUID REFERENCES crm_salespeople(id) ON DELETE SET NULL,
  bot_active BOOLEAN DEFAULT true,
  unread_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_preview TEXT,
  temperature VARCHAR(10) DEFAULT 'frio'
    CHECK (temperature IN ('frio','tibio','caliente')),
  bot_fields JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_conv_contact ON inbox_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_lead ON inbox_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_assigned ON inbox_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_status ON inbox_conversations(status);
CREATE INDEX IF NOT EXISTS idx_inbox_conv_last_msg ON inbox_conversations(last_message_at DESC);

CREATE TRIGGER inbox_conversations_updated_at
  BEFORE UPDATE ON inbox_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 4. INBOX MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES inbox_conversations(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_type VARCHAR(10) NOT NULL DEFAULT 'contact'
    CHECK (sender_type IN ('contact','agent','bot','system')),
  sender_id UUID,          -- crm_salespeople.id if agent, NULL if contact/bot
  content TEXT NOT NULL,
  content_type VARCHAR(20) DEFAULT 'text'
    CHECK (content_type IN ('text','image','video','audio','document','location','system')),
  media_url TEXT,
  status VARCHAR(20) DEFAULT 'sent'
    CHECK (status IN ('pending','sent','delivered','read','failed','simulated')),
  platform_message_id VARCHAR(255),  -- external API message ID (for future)
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_msg_conv ON inbox_messages(conversation_id, created_at);

-- ============================================
-- 5. RLS POLICIES
-- ============================================
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

-- Service role full access (server-side operations)
CREATE POLICY "service_all_contacts" ON crm_contacts
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_conv" ON inbox_conversations
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_all_msg" ON inbox_messages
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can read (needed for Supabase Realtime subscriptions)
CREATE POLICY "auth_read_contacts" ON crm_contacts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_conv" ON inbox_conversations
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_msg" ON inbox_messages
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- 6. REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_conversations;
