-- ============================================================
-- Migration 016 — Cola asíncrona para sync Odoo
-- ============================================================
-- Cuando un webhook de pago aprobado llega y el sync síncrono a Odoo falla
-- (Odoo caído, timeout, etc.), el item se encola aquí. Un cron procesa la
-- cola con backoff exponencial. Tras 5 intentos sin éxito, queda en
-- status='manual_review' y se dispara alerta Telegram al equipo.
-- ============================================================

CREATE TABLE IF NOT EXISTS odoo_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Item de cobranza que origina el sync (un item solo puede estar una vez en la cola)
  collection_item_id UUID NOT NULL REFERENCES collection_items(id) ON DELETE CASCADE UNIQUE,

  -- Datos para ejecutar el sync (denormalizados para no depender de joins en el cron)
  odoo_invoice_id INTEGER,                 -- puede ser null si no se conoce aun (lookup falla)
  odoo_partner_id INTEGER,
  payment_method TEXT NOT NULL,            -- "debito_inmediato" | "c2p" | etc.
  payment_reference TEXT,                  -- ref bancaria (ej. "000000031187535")
  payment_token TEXT NOT NULL,             -- short ID nuestro (ej. "WPY-E3849DB4")
  payment_date TEXT,                       -- YYYY-MM-DD
  amount_usd NUMERIC(12, 2),
  amount_ves NUMERIC(14, 2),

  -- Tracking de intentos (idempotencia parcial)
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,

  -- Idempotencia paso a paso: si ya hicimos post_invoice exitoso, no repetir
  post_invoice_done BOOLEAN NOT NULL DEFAULT false,
  register_payment_done BOOLEAN NOT NULL DEFAULT false,

  -- Status del item en la cola
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',         -- recién encolado, esperando primer intento
    'retrying',        -- al menos 1 intento fallido, programado para reintentar
    'manual_review',   -- 5+ intentos fallidos, requiere intervención humana
    'done',            -- sync completo, ya no se procesa
    'cancelled'        -- cancelado manualmente desde UI admin
  )),

  -- Notificaciones
  telegram_notified_at TIMESTAMPTZ,        -- cuando se envió alerta al pasar a manual_review

  -- Resolución manual (cuando admin marca como resuelto sin que el cron lo logre)
  resolved_manually BOOLEAN NOT NULL DEFAULT false,
  resolved_by_user_id UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_odoo_sync_queue_status_next ON odoo_sync_queue(status, next_attempt_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_odoo_sync_queue_partner ON odoo_sync_queue(odoo_partner_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_queue_invoice ON odoo_sync_queue(odoo_invoice_id);
CREATE INDEX IF NOT EXISTS idx_odoo_sync_queue_created_at ON odoo_sync_queue(created_at DESC);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_odoo_sync_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS odoo_sync_queue_set_updated_at ON odoo_sync_queue;
CREATE TRIGGER odoo_sync_queue_set_updated_at
  BEFORE UPDATE ON odoo_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_odoo_sync_queue_updated_at();

-- RLS — solo super_admin lee. Service role escribe.
ALTER TABLE odoo_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "odoo_sync_queue_super_admin_read" ON odoo_sync_queue;
CREATE POLICY "odoo_sync_queue_super_admin_read"
  ON odoo_sync_queue
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt()->'app_metadata'->>'role')::text IN ('super_admin', 'admin', 'finanzas')
  );

DROP POLICY IF EXISTS "odoo_sync_queue_service_all" ON odoo_sync_queue;
CREATE POLICY "odoo_sync_queue_service_all"
  ON odoo_sync_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE odoo_sync_queue IS
  'Cola asincrona de operaciones de sync Odoo. Procesada por cron cada 10 min con backoff exponencial. Tras 5 intentos -> manual_review + Telegram alert.';
