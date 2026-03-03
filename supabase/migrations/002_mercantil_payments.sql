-- ============================================
-- Migración: Pasarela de Pagos Mercantil
-- Agrega columnas gateway a payments existente
-- Crea tablas: payment_attempts, payment_webhook_logs, payment_reconciliation
-- ============================================

-- Extensión UUID (ya existe, pero por seguridad)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ALTER payments — agregar columnas Mercantil
-- ============================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_token TEXT UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS redirect_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS return_url TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS authorization_code TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Índice para buscar por token
CREATE INDEX IF NOT EXISTS idx_payments_token ON payments(payment_token);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ============================================
-- 2. PAYMENT_ATTEMPTS (Intentos de pago)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),
  payment_token TEXT,
  amount DECIMAL(18,2) NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  reference_number TEXT,
  authorization_code TEXT,
  redirect_url TEXT,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON payment_attempts(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_token ON payment_attempts(payment_token);

-- ============================================
-- 3. PAYMENT_WEBHOOK_LOGS (Notificaciones de Mercantil)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT,
  status TEXT,
  payment_method TEXT,
  reference_number TEXT,
  amount DECIMAL(18,2),
  raw_payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_invoice ON payment_webhook_logs(invoice_number);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received ON payment_webhook_logs(received_at DESC);

-- ============================================
-- 4. PAYMENT_RECONCILIATION (Conciliación)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_reconciliation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  total_transactions INT DEFAULT 0,
  matched INT DEFAULT 0,
  unmatched INT DEFAULT 0,
  transfers_count INT DEFAULT 0,
  mobile_payments_count INT DEFAULT 0,
  card_payments_count INT DEFAULT 0,
  details JSONB DEFAULT '{}',
  run_at TIMESTAMPTZ DEFAULT NOW(),
  run_by UUID REFERENCES profiles(id)
);

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reconciliation ENABLE ROW LEVEL SECURITY;

-- Service role full access (backend operations)
CREATE POLICY "Service role full access" ON payment_attempts FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON payment_webhook_logs FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON payment_reconciliation FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- DONE!
-- ============================================
