-- ============================================
-- Migration 003: Bequant BQN Configuration
-- ============================================

CREATE TABLE IF NOT EXISTS bequant_config (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label         TEXT NOT NULL DEFAULT 'BQN Principal',
  host          TEXT NOT NULL,
  port          INTEGER NOT NULL DEFAULT 7343,
  username      TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  ssl_verify    BOOLEAN NOT NULL DEFAULT false,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  last_test_at      TIMESTAMPTZ,
  last_test_status  TEXT CHECK (last_test_status IN ('success', 'error')),
  last_test_message TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Only one config can be enabled at a time (partial unique index)
CREATE UNIQUE INDEX bequant_config_enabled_idx ON bequant_config (enabled) WHERE enabled = true;

-- Auto-update updated_at
CREATE TRIGGER bequant_config_updated_at
  BEFORE UPDATE ON bequant_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE bequant_config ENABLE ROW LEVEL SECURITY;

-- admin, infraestructura can read
CREATE POLICY "bequant_config_select" ON bequant_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'infraestructura')
    )
  );

-- admin can insert/update/delete
CREATE POLICY "bequant_config_admin_all" ON bequant_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
