-- ============================================
-- WUIPI APP — CRM Ventas Schema
-- ============================================
-- Run after: 001_phase1_profiles_auth.sql, schema-facturacion.sql

-- ============================================
-- 1. CRM PRODUCTS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50),          -- residencial, empresarial, corporativo
  base_price DECIMAL(12,2) DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. CRM SALESPEOPLE
-- ============================================
CREATE TABLE IF NOT EXISTS crm_salespeople (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(30),
  type VARCHAR(20) DEFAULT 'internal' CHECK (type IN ('internal', 'external')),
  is_active BOOLEAN DEFAULT TRUE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. CRM LEADS
-- ============================================
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,     -- LEAD-0001 via sequences
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  phone_alt VARCHAR(30),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  sector VARCHAR(100),
  nodo VARCHAR(50),
  document_type VARCHAR(10),
  document_number VARCHAR(20),

  -- Pipeline
  stage VARCHAR(50) NOT NULL DEFAULT 'incoming'
    CHECK (stage IN (
      'incoming', 'contacto_inicial', 'info_enviada', 'en_instalacion',
      'no_factible', 'no_concretado', 'no_clasificado',
      'retirado_reactivacion', 'prueba_actualizacion', 'ganado'
    )),
  product_id UUID REFERENCES crm_products(id) ON DELETE SET NULL,
  salesperson_id UUID REFERENCES crm_salespeople(id) ON DELETE SET NULL,
  source VARCHAR(30) DEFAULT 'other'
    CHECK (source IN ('whatsapp', 'web', 'referido', 'social', 'other')),
  value DECIMAL(12,2) DEFAULT 0,

  -- Timestamps de estado
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,

  -- Link a cliente (auto-creado al ganar)
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ============================================
-- 4. CRM LEAD ACTIVITIES (Timeline)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('note', 'call', 'visit', 'stage_change', 'assignment', 'email', 'system')),
  description TEXT NOT NULL,
  metadata JSONB,
  created_by VARCHAR(255),    -- user name or "Sistema"
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 5. CRM QUOTAS (Monthly targets)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salesperson_id UUID NOT NULL REFERENCES crm_salespeople(id) ON DELETE CASCADE,
  month DATE NOT NULL,           -- first day: '2026-02-01'
  target_count INT DEFAULT 0,
  target_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(salesperson_id, month)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(stage);
CREATE INDEX IF NOT EXISTS idx_crm_leads_salesperson ON crm_leads(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_product ON crm_leads(product_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_source ON crm_leads(source);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created ON crm_leads(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_leads_deleted ON crm_leads(is_deleted);
CREATE INDEX IF NOT EXISTS idx_crm_leads_client ON crm_leads(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_won ON crm_leads(won_at);

CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON crm_lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_lead_activities(type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_created ON crm_lead_activities(created_at);

CREATE INDEX IF NOT EXISTS idx_crm_quotas_salesperson ON crm_quotas(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_crm_quotas_month ON crm_quotas(month);

CREATE INDEX IF NOT EXISTS idx_crm_salespeople_active ON crm_salespeople(is_active);

-- ============================================
-- TRIGGERS (reuse update_updated_at from phase 1)
-- ============================================
CREATE TRIGGER crm_products_updated_at
  BEFORE UPDATE ON crm_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER crm_salespeople_updated_at
  BEFORE UPDATE ON crm_salespeople
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER crm_leads_updated_at
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER crm_quotas_updated_at
  BEFORE UPDATE ON crm_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEQUENCE for lead codes
-- ============================================
INSERT INTO sequences (id, prefix, current_year, current_number)
VALUES ('lead', 'LEAD', 2026, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- SEED: Products
-- ============================================
INSERT INTO crm_products (name, category, base_price, sort_order) VALUES
  ('Fibra Óptica Residencial',   'residencial',   0, 1),
  ('Beamforming Residencial',    'residencial',   0, 2),
  ('Fibra Óptica Empresarial',   'empresarial',   0, 3),
  ('Beamforming Empresarial',    'empresarial',   0, 4),
  ('Beam Corporativo',           'corporativo',   0, 5)
ON CONFLICT DO NOTHING;
