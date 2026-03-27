-- ============================================================
-- Migration 004: Sistema de Cobros Masivos (Collection Campaigns)
-- ============================================================

-- Campañas de cobranza masiva
CREATE TABLE IF NOT EXISTS collection_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  total_items INT DEFAULT 0,
  total_amount_usd DECIMAL(18,2) DEFAULT 0,
  items_paid INT DEFAULT 0,
  amount_collected_usd DECIMAL(18,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','active','completed','cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Items individuales de cada campaña (un item = un cliente + factura)
CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES collection_campaigns(id) ON DELETE CASCADE,
  payment_token TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_cedula_rif TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  invoice_number TEXT,
  concept TEXT,
  amount_usd DECIMAL(18,2) NOT NULL,
  amount_bss DECIMAL(18,2),
  bcv_rate DECIMAL(18,4),
  payment_method TEXT CHECK (payment_method IN ('debito_inmediato','transferencia','stripe','paypal','pending')),
  payment_reference TEXT,
  payment_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','viewed','paid','failed','expired','conciliating')),
  stripe_session_id TEXT,
  mercantil_reference TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Log de notificaciones enviadas
CREATE TABLE IF NOT EXISTS collection_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES collection_items(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
  attempt_number INT DEFAULT 1,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_collection_items_campaign ON collection_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_token ON collection_items(payment_token);
CREATE INDEX IF NOT EXISTS idx_collection_items_status ON collection_items(status);
CREATE INDEX IF NOT EXISTS idx_collection_notifications_item ON collection_notifications(item_id);

-- RLS
ALTER TABLE collection_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas para admins/finanzas
CREATE POLICY "Admins full access campaigns"
  ON collection_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role::text IN ('admin', 'finanzas')
    )
  );

CREATE POLICY "Admins full access items"
  ON collection_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role::text IN ('admin', 'finanzas')
    )
  );

-- Items: authorized roles only (service role bypasses RLS for public endpoints)
CREATE POLICY "Authorized roles access items"
  ON collection_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role::text IN ('super_admin', 'admin', 'finanzas', 'analista_cobranzas')
    )
  );

CREATE POLICY "Admins full access notifications"
  ON collection_notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role::text IN ('admin', 'finanzas')
    )
  );
