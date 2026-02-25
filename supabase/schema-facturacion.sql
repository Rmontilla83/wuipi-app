-- ============================================
-- WUIPI ERP - Fase 9A: Facturación
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PLANS (Planes de servicio) - before clients
-- ============================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  code VARCHAR(20) UNIQUE NOT NULL,               -- PLAN-50, PLAN-100
  name VARCHAR(100) NOT NULL,                     -- "Plan 50 Mbps"
  description TEXT,
  
  -- Pricing
  price_usd DECIMAL(10,2) NOT NULL,
  price_ves DECIMAL(14,2),                        -- Optional VES price
  
  -- Service specs
  speed_down INT,                                  -- Mbps download
  speed_up INT,                                    -- Mbps upload
  technology VARCHAR(50),                          -- FTTH, FTTR, Wireless
  
  -- Billing
  billing_frequency VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly, annual
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PAYMENT_METHODS (Métodos de pago) - before clients
-- ============================================
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  code VARCHAR(30) UNIQUE NOT NULL,               -- mercantil, pago_movil, zelle, etc
  name VARCHAR(100) NOT NULL,                     -- "Banco Mercantil"
  type VARCHAR(30) NOT NULL,                      -- gateway, bank_transfer, mobile_payment, crypto, cash, pos
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',     -- USD, VES
  
  -- Gateway config (for Mercantil)
  gateway_config JSONB,                           -- API keys, merchant ID, etc
  
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. CLIENTS (Clientes)
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  code VARCHAR(20) UNIQUE NOT NULL,              -- WUI-0001
  legal_name VARCHAR(255) NOT NULL,               -- Razón social
  trade_name VARCHAR(255),                        -- Nombre comercial
  document_type VARCHAR(10) NOT NULL DEFAULT 'J', -- V, J, E, G, P
  document_number VARCHAR(20) NOT NULL,           -- RIF/CI
  
  -- Contact
  email VARCHAR(255),
  phone VARCHAR(30),
  phone_alt VARCHAR(30),
  contact_person VARCHAR(255),
  
  -- Address
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100) DEFAULT 'Anzoátegui',
  sector VARCHAR(100),
  nodo VARCHAR(50),
  
  -- Service info
  plan_id UUID REFERENCES plans(id),
  service_status VARCHAR(20) DEFAULT 'active',    -- active, suspended, cancelled
  installation_date DATE,
  
  -- Billing
  billing_currency VARCHAR(3) DEFAULT 'USD',      -- USD, VES
  billing_day INT DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  payment_method_default UUID REFERENCES payment_methods(id),
  credit_balance DECIMAL(12,2) DEFAULT 0,         -- Saldo a favor
  
  -- Metadata
  notes TEXT,
  tags TEXT[],
  kommo_contact_id BIGINT,                        -- Link to Kommo CRM
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ============================================
-- 4. SERVICES (Servicios puntuales)
-- ============================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  code VARCHAR(20) UNIQUE NOT NULL,               -- SVC-001
  name VARCHAR(100) NOT NULL,                     -- "Instalación FTTH"
  description TEXT,
  category VARCHAR(50) NOT NULL,                  -- instalacion, reparacion, adecuacion, venta_equipo, otro
  
  -- Pricing
  price_usd DECIMAL(10,2) NOT NULL,
  price_ves DECIMAL(14,2),
  
  -- Tax
  taxable BOOLEAN DEFAULT TRUE,
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. EXCHANGE_RATES (Tasas de cambio)
-- ============================================
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  from_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  to_currency VARCHAR(3) NOT NULL DEFAULT 'VES',
  rate DECIMAL(14,4) NOT NULL,                    -- 1 USD = X VES
  source VARCHAR(50) DEFAULT 'BCV',               -- BCV, parallel, custom
  
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(from_currency, to_currency, effective_date, source)
);

-- ============================================
-- 6. INVOICES (Facturas)
-- ============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  invoice_number VARCHAR(30) UNIQUE NOT NULL,     -- FAC-2026-000001
  invoice_type VARCHAR(20) DEFAULT 'invoice',     -- invoice, credit_note, debit_note
  
  -- Client
  client_id UUID NOT NULL REFERENCES clients(id),
  client_name VARCHAR(255) NOT NULL,              -- Snapshot at invoice time
  client_document VARCHAR(30) NOT NULL,           -- Snapshot
  client_address TEXT,                            -- Snapshot
  
  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_start DATE,                              -- For recurring: start of billing period
  period_end DATE,                                -- For recurring: end of billing period
  
  -- Currency
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(14,4) DEFAULT 1,          -- Rate at invoice time
  
  -- Amounts
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_iva_pct DECIMAL(5,2) DEFAULT 16.00,
  tax_iva_amount DECIMAL(12,2) DEFAULT 0,
  tax_igtf_pct DECIMAL(5,2) DEFAULT 0,           -- 3% for foreign currency
  tax_igtf_amount DECIMAL(12,2) DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_ves DECIMAL(14,2),                        -- Equivalent in VES
  
  -- Payment status
  status VARCHAR(20) DEFAULT 'draft',             -- draft, sent, partial, paid, overdue, cancelled, void
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) DEFAULT 0,
  
  -- Metadata
  notes TEXT,
  internal_notes TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_source_id UUID,                       -- Original invoice if auto-generated
  
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

-- ============================================
-- 7. INVOICE_ITEMS (Líneas de factura)
-- ============================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Item reference
  item_type VARCHAR(20) NOT NULL,                 -- plan, service, custom
  plan_id UUID REFERENCES plans(id),
  service_id UUID REFERENCES services(id),
  
  -- Details
  description VARCHAR(500) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  
  -- Tax
  taxable BOOLEAN DEFAULT TRUE,
  tax_rate DECIMAL(5,2) DEFAULT 16.00,
  
  -- Amounts
  subtotal DECIMAL(12,2) NOT NULL,                -- quantity * unit_price
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. PAYMENTS (Pagos recibidos)
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identity
  payment_number VARCHAR(30) UNIQUE NOT NULL,     -- PAG-2026-000001
  
  -- Client & Invoice
  client_id UUID NOT NULL REFERENCES clients(id),
  invoice_id UUID REFERENCES invoices(id),        -- Can be null for advance payments
  
  -- Payment details
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(14,4) DEFAULT 1,
  amount_ves DECIMAL(14,2),
  
  -- Gateway info (for Mercantil)
  gateway_reference VARCHAR(100),                 -- Transaction ID from gateway
  gateway_response JSONB,                         -- Full response from gateway
  
  -- Bank transfer info
  reference_number VARCHAR(100),                  -- Nro de referencia
  bank_origin VARCHAR(100),                       -- Banco origen
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',           -- pending, confirmed, rejected, refunded
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by VARCHAR(100),
  
  -- Metadata
  notes TEXT,
  receipt_url TEXT,                                -- Link to receipt/proof
  
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. INVOICE_SEQUENCE (Auto-numbering)
-- ============================================
CREATE TABLE sequences (
  id VARCHAR(50) PRIMARY KEY,                     -- 'invoice', 'payment', 'client'
  prefix VARCHAR(20) NOT NULL,
  current_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  current_number INT NOT NULL DEFAULT 0
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_clients_code ON clients(code);
CREATE INDEX idx_clients_document ON clients(document_type, document_number);
CREATE INDEX idx_clients_service_status ON clients(service_status) WHERE NOT is_deleted;
CREATE INDEX idx_clients_plan ON clients(plan_id) WHERE NOT is_deleted;

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status) WHERE NOT is_deleted;
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(payment_date);

CREATE INDEX idx_exchange_rates_date ON exchange_rates(effective_date DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_plans_updated BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_services_updated BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Next sequence number
CREATE OR REPLACE FUNCTION next_sequence(seq_id VARCHAR, seq_prefix VARCHAR DEFAULT NULL)
RETURNS VARCHAR AS $$
DECLARE
  current_yr INT := EXTRACT(YEAR FROM NOW());
  seq RECORD;
  next_num INT;
  result VARCHAR;
BEGIN
  SELECT * INTO seq FROM sequences WHERE id = seq_id FOR UPDATE;
  
  IF NOT FOUND THEN
    INSERT INTO sequences (id, prefix, current_year, current_number)
    VALUES (seq_id, COALESCE(seq_prefix, UPPER(seq_id)), current_yr, 1);
    RETURN COALESCE(seq_prefix, UPPER(seq_id)) || '-' || current_yr || '-' || LPAD('1', 6, '0');
  END IF;
  
  IF seq.current_year < current_yr THEN
    UPDATE sequences SET current_year = current_yr, current_number = 1 WHERE id = seq_id;
    next_num := 1;
  ELSE
    UPDATE sequences SET current_number = seq.current_number + 1 WHERE id = seq_id;
    next_num := seq.current_number + 1;
  END IF;
  
  result := seq.prefix || '-' || current_yr || '-' || LPAD(next_num::TEXT, 6, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Recalculate invoice totals
CREATE OR REPLACE FUNCTION recalc_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  inv RECORD;
  sub DECIMAL(12,2);
  iva DECIMAL(12,2);
  igtf DECIMAL(12,2);
  disc DECIMAL(12,2);
  tot DECIMAL(12,2);
BEGIN
  -- Get invoice
  SELECT * INTO inv FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Sum items
  SELECT COALESCE(SUM(subtotal), 0), COALESCE(SUM(tax_amount), 0)
  INTO sub, iva
  FROM invoice_items WHERE invoice_id = inv.id;
  
  -- IGTF (3% on total if foreign currency)
  IF inv.currency != 'VES' AND inv.tax_igtf_pct > 0 THEN
    igtf := ROUND((sub + iva) * inv.tax_igtf_pct / 100, 2);
  ELSE
    igtf := 0;
  END IF;
  
  -- Discount
  disc := ROUND(sub * COALESCE(inv.discount_pct, 0) / 100, 2);
  
  -- Total
  tot := sub - disc + iva + igtf;
  
  UPDATE invoices SET
    subtotal = sub,
    tax_iva_amount = iva,
    tax_igtf_amount = igtf,
    discount_amount = disc,
    total = tot,
    total_ves = CASE WHEN inv.currency = 'USD' THEN ROUND(tot * inv.exchange_rate, 2) ELSE tot END,
    balance_due = tot - COALESCE(inv.amount_paid, 0)
  WHERE id = inv.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_invoice_items_recalc
AFTER INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION recalc_invoice_totals();

-- Update invoice on payment
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(12,2);
  inv RECORD;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status != 'confirmed' THEN RETURN NEW; END IF;
  
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments 
  WHERE invoice_id = NEW.invoice_id AND status = 'confirmed';
  
  SELECT * INTO inv FROM invoices WHERE id = NEW.invoice_id;
  
  UPDATE invoices SET
    amount_paid = total_paid,
    balance_due = total - total_paid,
    status = CASE
      WHEN total_paid >= inv.total THEN 'paid'
      WHEN total_paid > 0 THEN 'partial'
      ELSE status
    END
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_payment_update_invoice
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- ============================================
-- SEED DATA
-- ============================================

-- Payment Methods
INSERT INTO payment_methods (code, name, type, currency, is_primary, sort_order) VALUES
  ('mercantil', 'Banco Mercantil (Pasarela)', 'gateway', 'VES', TRUE, 1),
  ('pago_movil', 'Pago Móvil', 'mobile_payment', 'VES', FALSE, 2),
  ('transferencia', 'Transferencia Bancaria', 'bank_transfer', 'VES', FALSE, 3),
  ('zelle', 'Zelle', 'bank_transfer', 'USD', FALSE, 4),
  ('efectivo_usd', 'Efectivo USD', 'cash', 'USD', FALSE, 5),
  ('binance', 'Binance Pay / USDT', 'crypto', 'USD', FALSE, 6),
  ('punto_venta', 'Punto de Venta', 'pos', 'VES', FALSE, 7);

-- Sequences
INSERT INTO sequences (id, prefix, current_year, current_number) VALUES
  ('invoice', 'FAC', 2026, 0),
  ('payment', 'PAG', 2026, 0),
  ('client', 'WUI', 2026, 0),
  ('credit_note', 'NC', 2026, 0);

-- Sample Plans (adjust to your real plans)
INSERT INTO plans (code, name, description, price_usd, speed_down, speed_up, technology) VALUES
  ('PLAN-25', 'Plan 25 Mbps', 'Internet 25 Mbps simétrico', 20.00, 25, 25, 'FTTH'),
  ('PLAN-50', 'Plan 50 Mbps', 'Internet 50 Mbps simétrico', 30.00, 50, 50, 'FTTH'),
  ('PLAN-100', 'Plan 100 Mbps', 'Internet 100 Mbps simétrico', 45.00, 100, 100, 'FTTH'),
  ('PLAN-200', 'Plan 200 Mbps', 'Internet 200 Mbps simétrico', 65.00, 200, 200, 'FTTH'),
  ('PLAN-300', 'Plan 300 Mbps', 'Internet 300 Mbps / 150 Mbps', 85.00, 300, 150, 'FTTH'),
  ('PLAN-W25', 'Wireless 25 Mbps', 'Internet inalámbrico 25 Mbps', 18.00, 25, 10, 'Wireless'),
  ('PLAN-W50', 'Wireless 50 Mbps', 'Internet inalámbrico 50 Mbps', 28.00, 50, 20, 'Wireless');

-- Sample Services
INSERT INTO services (code, name, description, category, price_usd) VALUES
  ('SVC-INST-FTTH', 'Instalación FTTH', 'Instalación de fibra óptica al hogar', 'instalacion', 50.00),
  ('SVC-INST-WIRE', 'Instalación Wireless', 'Instalación de enlace inalámbrico', 'instalacion', 40.00),
  ('SVC-REPAR', 'Reparación General', 'Servicio de reparación técnica', 'reparacion', 25.00),
  ('SVC-CABLE-A', 'Cableado Tipo A', 'Cableado estructurado básico', 'adecuacion', 35.00),
  ('SVC-CABLE-B', 'Cableado Tipo B', 'Cableado estructurado avanzado', 'adecuacion', 55.00),
  ('SVC-RED-INT', 'Red Interna', 'Configuración de red interna', 'adecuacion', 30.00),
  ('SVC-MUDANZA', 'Mudanza de Servicio', 'Traslado de servicio a nueva ubicación', 'adecuacion', 45.00),
  ('SVC-ROUTER', 'Venta de Router', 'Router WiFi mesh', 'venta_equipo', 40.00),
  ('SVC-POE', 'Venta de PoE', 'Inyector PoE', 'venta_equipo', 15.00),
  ('SVC-UPS', 'Venta Mini UPS', 'Mini UPS para ONT/Router', 'venta_equipo', 25.00);

-- ============================================
-- ROW LEVEL SECURITY (basic - expand as needed)
-- ============================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;

-- Allow all for service_role (backend)
CREATE POLICY "Service role full access" ON clients FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON plans FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON services FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON invoices FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON invoice_items FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON payments FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON payment_methods FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON exchange_rates FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Service role full access" ON sequences FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- DONE! Now add these env vars to your .env / Vercel:
-- NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
-- NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
-- SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
-- ============================================
