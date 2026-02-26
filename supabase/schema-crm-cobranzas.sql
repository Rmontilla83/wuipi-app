-- ============================================
-- WUIPI APP — CRM Cobranzas Schema
-- ============================================
-- Run after: 001_phase1_profiles_auth.sql, schema-facturacion.sql

-- ============================================
-- 1. CRM COLLECTORS (Cobradores)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_collectors (
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
-- 2. CRM COLLECTIONS (Casos de cobranza)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,     -- COB-0001 via sequences
  client_id UUID NOT NULL REFERENCES clients(id),
  client_name VARCHAR(255) NOT NULL,    -- snapshot
  client_phone VARCHAR(30),
  client_email VARCHAR(255),

  -- Pipeline
  stage VARCHAR(50) NOT NULL DEFAULT 'leads_entrantes'
    CHECK (stage IN (
      'leads_entrantes', 'contacto_inicial', 'info_enviada', 'no_clasificado',
      'gestion_suspendidos', 'gestion_pre_retiro', 'gestion_cobranza',
      'recuperado', 'retirado_definitivo'
    )),
  collector_id UUID REFERENCES crm_collectors(id) ON DELETE SET NULL,

  -- Debt info
  amount_due DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  days_overdue INT DEFAULT 0,
  last_payment_date DATE,
  months_overdue INT DEFAULT 0,
  plan_name VARCHAR(100),

  source VARCHAR(30) DEFAULT 'internal'
    CHECK (source IN ('internal', 'system', 'kommo')),

  -- Timestamps de estado
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  recovered_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ============================================
-- 3. CRM COLLECTION ACTIVITIES (Timeline)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_collection_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES crm_collections(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('note', 'call', 'visit', 'stage_change', 'payment_promise', 'payment_received', 'assignment', 'system')),
  description TEXT NOT NULL,
  metadata JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 4. CRM COLLECTION QUOTAS (Monthly collector targets)
-- ============================================
CREATE TABLE IF NOT EXISTS crm_collection_quotas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collector_id UUID NOT NULL REFERENCES crm_collectors(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  target_count INT DEFAULT 0,
  target_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collector_id, month)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_crm_collections_stage ON crm_collections(stage);
CREATE INDEX IF NOT EXISTS idx_crm_collections_collector ON crm_collections(collector_id);
CREATE INDEX IF NOT EXISTS idx_crm_collections_client ON crm_collections(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_collections_days_overdue ON crm_collections(days_overdue);
CREATE INDEX IF NOT EXISTS idx_crm_collections_created ON crm_collections(created_at);
CREATE INDEX IF NOT EXISTS idx_crm_collections_deleted ON crm_collections(is_deleted);

CREATE INDEX IF NOT EXISTS idx_crm_coll_activities_collection ON crm_collection_activities(collection_id);
CREATE INDEX IF NOT EXISTS idx_crm_coll_activities_type ON crm_collection_activities(type);
CREATE INDEX IF NOT EXISTS idx_crm_coll_activities_created ON crm_collection_activities(created_at);

CREATE INDEX IF NOT EXISTS idx_crm_coll_quotas_collector ON crm_collection_quotas(collector_id);
CREATE INDEX IF NOT EXISTS idx_crm_coll_quotas_month ON crm_collection_quotas(month);

CREATE INDEX IF NOT EXISTS idx_crm_collectors_active ON crm_collectors(is_active);

-- ============================================
-- TRIGGERS (reuse update_updated_at from phase 1)
-- ============================================
CREATE TRIGGER crm_collectors_updated_at
  BEFORE UPDATE ON crm_collectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER crm_collections_updated_at
  BEFORE UPDATE ON crm_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER crm_collection_quotas_updated_at
  BEFORE UPDATE ON crm_collection_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEQUENCE for collection codes
-- ============================================
INSERT INTO sequences (id, prefix, current_year, current_number)
VALUES ('collection', 'COB', 2026, 0)
ON CONFLICT (id) DO NOTHING;
