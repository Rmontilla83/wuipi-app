-- Portal de Clientes: tickets y solicitudes de cambio de plan
-- Autenticación por Magic Link, RLS por odoo_partner_id del JWT

-- ============================================
-- Portal Tickets
-- ============================================
CREATE TABLE IF NOT EXISTS portal_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_partner_id INT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('soporte_tecnico', 'facturacion', 'cambio_plan', 'general')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_portal_tickets_partner ON portal_tickets(odoo_partner_id);
CREATE INDEX idx_portal_tickets_status ON portal_tickets(status);

ALTER TABLE portal_tickets ENABLE ROW LEVEL SECURITY;

-- Customers can see their own tickets
CREATE POLICY "portal_tickets_select_own" ON portal_tickets
  FOR SELECT USING (
    odoo_partner_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'odoo_partner_id')::int, -1)
  );

-- Customers can create tickets
CREATE POLICY "portal_tickets_insert_own" ON portal_tickets
  FOR INSERT WITH CHECK (
    odoo_partner_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'odoo_partner_id')::int, -1)
  );

-- Admin/service role full access
CREATE POLICY "portal_tickets_admin" ON portal_tickets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'soporte', 'analista_soporte')
    )
  );

-- ============================================
-- Portal Plan Change Requests
-- ============================================
CREATE TABLE IF NOT EXISTS portal_plan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_partner_id INT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  subscription_name TEXT,
  current_plan TEXT NOT NULL,
  requested_plan TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'completed', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_portal_plan_requests_partner ON portal_plan_requests(odoo_partner_id);
CREATE INDEX idx_portal_plan_requests_status ON portal_plan_requests(status);

ALTER TABLE portal_plan_requests ENABLE ROW LEVEL SECURITY;

-- Customers can see their own requests
CREATE POLICY "portal_plan_requests_select_own" ON portal_plan_requests
  FOR SELECT USING (
    odoo_partner_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'odoo_partner_id')::int, -1)
  );

-- Customers can create requests
CREATE POLICY "portal_plan_requests_insert_own" ON portal_plan_requests
  FOR INSERT WITH CHECK (
    odoo_partner_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'odoo_partner_id')::int, -1)
  );

-- Admin/ventas full access
CREATE POLICY "portal_plan_requests_admin" ON portal_plan_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin', 'gerente', 'vendedor')
    )
  );
