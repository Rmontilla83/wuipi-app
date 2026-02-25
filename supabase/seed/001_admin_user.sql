-- ===========================================
-- WUIPI APP - Seed Data
-- Run after migration to create initial admin
-- ===========================================

-- Note: Create the auth user first via Supabase Dashboard or CLI:
--   supabase auth admin create-user --email admin@wuipi.com --password <secure-password>
-- 
-- Then update their profile:
-- UPDATE profiles SET role = 'admin', full_name = 'Rafael' WHERE email = 'admin@wuipi.com';

-- Example team members (create auth users first, then update):
-- UPDATE profiles SET role = 'soporte', full_name = 'Carlos M.' WHERE email = 'carlos@wuipi.com';
-- UPDATE profiles SET role = 'finanzas', full_name = 'María R.' WHERE email = 'maria@wuipi.com';
-- UPDATE profiles SET role = 'infraestructura', full_name = 'José P.' WHERE email = 'jose@wuipi.com';
