-- =============================================================
-- payment_gateway_logs — log unificado de operaciones de pasarelas
-- =============================================================
--
-- Captura el ciclo completo de cada intento de pago contra cada pasarela
-- (Mercantil, C2P, Stripe, PayPal, transferencia, cash). Eventos cubiertos:
-- initiated -> request_sent -> response_received -> webhook_received ->
-- success | error | timeout | abandoned.
--
-- Lo que va al log se controla en aplicacion via whitelist por gateway
-- (src/lib/dal/payment-gateway-logs.ts). Aca solo se define el schema y RLS.
--
-- Privacidad: nunca llegan a esta tabla OTPs, tokens auth, blobs cifrados,
-- numeros de cuenta completos. El sanitizer en codigo se encarga.
--
-- Retencion: cron mensual purga segun tipo de evento (success 6m, error 12m,
-- initiated/request_sent sin response 3m). Esa logica vive en otro archivo.

CREATE TABLE payment_gateway_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vinculo al item de cobro (nullable: eventos de pasarelas que llegan sin
  -- match con item por error de routing tambien deben ser auditables)
  collection_item_id UUID REFERENCES collection_items(id) ON DELETE SET NULL,
  payment_token TEXT,

  -- Pasarela y producto especifico
  gateway TEXT NOT NULL CHECK (gateway IN (
    'mercantil', 'c2p', 'stripe', 'paypal', 'transferencia', 'cash'
  )),
  gateway_product TEXT,
  -- Ej: 'web_button', 'debito_inmediato', 'c2p_otp_request', 'c2p_payment',
  -- 'stripe_checkout', 'paypal_order', 'transfer_search', 'office_collect'

  -- Que paso
  event_type TEXT NOT NULL CHECK (event_type IN (
    'initiated', 'request_sent', 'response_received', 'webhook_received',
    'success', 'error', 'timeout', 'abandoned'
  )),
  outcome TEXT CHECK (outcome IN ('success', 'error', 'pending') OR outcome IS NULL),

  -- Detalle (sanitizado por aplicacion antes de escribir)
  request_payload JSONB,
  response_payload JSONB,
  response_code TEXT,           -- '00', '4025', '99999', '821', etc.
  response_message TEXT,

  -- Categorizacion para dashboards y analisis
  error_category TEXT,
  -- Ej: 'intra_bank_limit', 'insufficient_funds', 'invalid_otp',
  -- 'invalid_credentials', 'timeout', 'gateway_5xx', 'unknown'

  -- Contexto de la peticion
  ip_address TEXT,
  user_agent TEXT,
  duration_ms INTEGER,

  -- Cliente denormalizado (para reportes sin join)
  customer_cedula_rif TEXT,     -- ya enmascarado por aplicacion
  customer_name TEXT,
  amount_usd NUMERIC(10,2),
  amount_ves NUMERIC(14,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----- Indices ------------------------------------------------

-- Lookup por item (timeline de un intento de pago)
CREATE INDEX idx_pgl_item ON payment_gateway_logs (collection_item_id, created_at DESC)
  WHERE collection_item_id IS NOT NULL;

-- Dashboards / tasa exito por gateway
CREATE INDEX idx_pgl_gateway_outcome ON payment_gateway_logs (gateway, outcome, created_at DESC);

-- Forensics por categoria de error
CREATE INDEX idx_pgl_error_cat ON payment_gateway_logs (error_category, created_at DESC)
  WHERE error_category IS NOT NULL;

-- Busqueda por payment_token (mismo token puede tener N eventos)
CREATE INDEX idx_pgl_token ON payment_gateway_logs (payment_token, created_at DESC)
  WHERE payment_token IS NOT NULL;

-- Para el cron de purga (filtrado por edad)
CREATE INDEX idx_pgl_created ON payment_gateway_logs (created_at);

-- ----- RLS ----------------------------------------------------

ALTER TABLE payment_gateway_logs ENABLE ROW LEVEL SECURITY;

-- Lectura: solo roles administrativos
-- Patron via JWT (igual que odoo_sync_queue) — mas rapido que subquery profiles
CREATE POLICY "pgl_admin_read" ON payment_gateway_logs
  FOR SELECT
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = ANY (ARRAY[
      'super_admin', 'admin', 'gerente', 'finanzas'
    ]))
  );

-- INSERT/UPDATE/DELETE: solo service_role (que bypasea RLS automaticamente).
-- El cron de purga corre como service_role. La app escribe via createAdminSupabase.
-- No definir policy permisiva para auth roles.

-- ----- Comentarios para schema browsers ----------------------

COMMENT ON TABLE payment_gateway_logs IS
  'Log unificado de eventos de pasarelas de pago. Sanitizado en aplicacion (whitelist + masking). RLS lectura solo administrativos.';

COMMENT ON COLUMN payment_gateway_logs.gateway IS
  'mercantil|c2p|stripe|paypal|transferencia|cash';

COMMENT ON COLUMN payment_gateway_logs.event_type IS
  'initiated|request_sent|response_received|webhook_received|success|error|timeout|abandoned';

COMMENT ON COLUMN payment_gateway_logs.error_category IS
  'Categoria normalizada del error para dashboards: intra_bank_limit, insufficient_funds, invalid_otp, invalid_credentials, timeout, gateway_5xx, unknown';
