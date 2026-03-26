-- ===========================================
-- WUIPI APP - Migration 005: Enhanced RBAC
-- Add new roles, department, created_by
-- ===========================================

-- 1. Add new role values to the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gerente';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vendedor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'analista_cobranzas';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'analista_soporte';

-- 2. Add new columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- 3. Set Rafael as super_admin
UPDATE profiles SET role = 'super_admin' WHERE email = 'rafaelmontilla8@gmail.com';

-- 4. Create audit_log table if not exists (may already exist from migration 001)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- 5. RLS for audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Drop if exists to recreate
DROP POLICY IF EXISTS "Super admin and admin read audit" ON audit_log;
DROP POLICY IF EXISTS "Service role insert audit" ON audit_log;

CREATE POLICY "Super admin and admin read audit" ON audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- Allow service role to insert (for server-side logging)
CREATE POLICY "Service role insert audit" ON audit_log
  FOR INSERT WITH CHECK (true);
