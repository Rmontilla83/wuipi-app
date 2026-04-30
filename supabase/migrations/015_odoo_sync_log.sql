-- ============================================================
-- Migration 015 — Odoo Sync Audit Log
-- ============================================================
-- Tabla de auditoría para todos los intentos de sync de pagos a Odoo.
-- Cada vez que el sistema intenta postear una factura draft a posted en VES,
-- se escribe una fila aquí con el cálculo, la tasa usada, y el resultado.
--
-- Razón: trazabilidad total. Si algo sale mal en producción, podemos ver
-- exactamente qué se intentó hacer, con qué datos, y qué respondió Odoo.
-- ============================================================

CREATE TABLE IF NOT EXISTS odoo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculo opcional al item de cobranza que origina el sync
  collection_item_id UUID REFERENCES collection_items(id) ON DELETE SET NULL,

  -- Identificadores en Odoo
  odoo_partner_id INTEGER NOT NULL,
  odoo_invoice_id INTEGER NOT NULL,
  odoo_invoice_name TEXT,                  -- "INV/2026/04/0001" tras posting (null en preview)
  odoo_origin TEXT,                        -- "S20548" — la suscripción que generó la factura

  -- Datos del cálculo
  amount_usd NUMERIC(12, 2) NOT NULL,
  amount_ves NUMERIC(14, 2) NOT NULL,
  bcv_rate NUMERIC(20, 10) NOT NULL,       -- Bs por USD (ej. 486.1955)
  bcv_rate_date TEXT,                      -- "2026-04-29"

  -- Estado
  status TEXT NOT NULL CHECK (status IN ('preview', 'posted', 'failed', 'skipped')),
  mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'real')),

  -- Errores y respuesta de Odoo
  error_message TEXT,
  odoo_response JSONB,

  -- Quién disparó el sync
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('manual', 'webhook', 'cron', 'api')),
  triggered_by_user_id UUID,               -- profile.id si fue manual

  -- Whitelist activa al momento del sync (para auditoría histórica)
  whitelist_active BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_invoice_id ON odoo_sync_log(odoo_invoice_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_partner_id ON odoo_sync_log(odoo_partner_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_collection_item ON odoo_sync_log(collection_item_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_created_at ON odoo_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_log_status ON odoo_sync_log(status, mode);

-- RLS — solo super_admin lee
ALTER TABLE odoo_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "odoo_sync_log_super_admin_read" ON odoo_sync_log;
CREATE POLICY "odoo_sync_log_super_admin_read"
  ON odoo_sync_log
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->'app_metadata'->>'role')::text = 'super_admin'
  );

-- Service role escribe (la app usa service role para insertar)
DROP POLICY IF EXISTS "odoo_sync_log_service_write" ON odoo_sync_log;
CREATE POLICY "odoo_sync_log_service_write"
  ON odoo_sync_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "odoo_sync_log_service_update" ON odoo_sync_log;
CREATE POLICY "odoo_sync_log_service_update"
  ON odoo_sync_log
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE odoo_sync_log IS
  'Audit log de operaciones de sync de pagos a Odoo. Cada intento (preview, posted, failed) se registra aquí para trazabilidad total.';
