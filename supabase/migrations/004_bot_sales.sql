-- ===========================================
-- Bot de Ventas — Tablas de conversación
-- ===========================================

-- Conversaciones activas del bot
CREATE TABLE IF NOT EXISTS bot_sales_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kommo_lead_id TEXT NOT NULL,
  kommo_contact_id TEXT NOT NULL,
  kommo_chat_id TEXT NOT NULL,
  kommo_talk_id TEXT,
  phone TEXT DEFAULT '',
  channel TEXT DEFAULT 'WhatsApp',  -- WhatsApp, Instagram DM, Facebook DM, etc.
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'completed', 'expired')),
  attended_by TEXT DEFAULT 'bot' CHECK (attended_by IN ('bot', 'human', 'mixed')),
  messages_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  temperature TEXT DEFAULT 'frio' CHECK (temperature IN ('frio', 'tibio', 'caliente')),
  classification TEXT,  -- intent del último mensaje
  needs_human BOOLEAN DEFAULT false,

  -- Datos recopilados por el bot
  ciudad TEXT,
  zona TEXT,
  tipo_servicio TEXT,   -- hogar, pyme
  plan_interes TEXT,
  nombre_cliente TEXT,
  cedula TEXT,
  telefono TEXT,
  direccion TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_bot_conv_lead ON bot_sales_conversations(kommo_lead_id);
CREATE INDEX IF NOT EXISTS idx_bot_conv_status ON bot_sales_conversations(status);
CREATE INDEX IF NOT EXISTS idx_bot_conv_last_msg ON bot_sales_conversations(last_message_at);

-- Mensajes individuales de cada conversación
CREATE TABLE IF NOT EXISTS bot_sales_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES bot_sales_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB,  -- intent, temperature, fieldsDetected, errors, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_msg_conv ON bot_sales_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bot_msg_created ON bot_sales_messages(created_at);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_bot_conv_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bot_conv_updated_at
  BEFORE UPDATE ON bot_sales_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_bot_conv_updated_at();

-- RLS: solo service_role puede acceder (operaciones del bot son server-side)
ALTER TABLE bot_sales_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sales_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bot_conv" ON bot_sales_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_bot_msg" ON bot_sales_messages
  FOR ALL USING (auth.role() = 'service_role');
