-- ============================================
-- Migration 009: Bequant sync tables + snapshots + audit
-- ============================================
-- Background sync pulls from BQN every 10 min (subscribers/groups/policies),
-- and node snapshots every 1 h. UI reads from these tables (zero BQN load).
-- DPI PER-SUBSCRIBER is NEVER persisted (privacy: CONATEL).
-- Writes are performed by service_role only (crons).
-- ============================================

-- ── Subscribers (sync every 10min) ─────────────────────────────
CREATE TABLE IF NOT EXISTS bequant_subscribers (
  ip                    TEXT PRIMARY KEY,
  subscriber_id         TEXT,
  policy_rate           TEXT,
  policy_assigned_by    TEXT,
  subscriber_groups     TEXT[] NOT NULL DEFAULT '{}',
  -- Odoo enrichment (cached)
  odoo_partner_id       BIGINT,
  odoo_service_id       BIGINT,
  odoo_partner_name     TEXT,
  odoo_service_state    TEXT,
  odoo_product_name     TEXT,
  odoo_node_name        TEXT,
  odoo_ip_cpe           TEXT,
  odoo_ipv4             TEXT,
  last_synced_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bequant_subs_partner  ON bequant_subscribers (odoo_partner_id);
CREATE INDEX IF NOT EXISTS idx_bequant_subs_policy   ON bequant_subscribers (policy_rate);
CREATE INDEX IF NOT EXISTS idx_bequant_subs_groups   ON bequant_subscribers USING GIN (subscriber_groups);
CREATE INDEX IF NOT EXISTS idx_bequant_subs_service  ON bequant_subscribers (odoo_service_state);
CREATE INDEX IF NOT EXISTS idx_bequant_subs_synced   ON bequant_subscribers (last_synced_at);

-- ── Subscriber groups (torres AVI_*) ───────────────────────────
CREATE TABLE IF NOT EXISTS bequant_subscriber_groups (
  name           TEXT PRIMARY KEY,
  group_type     TEXT NOT NULL,
  ranges         TEXT[] NOT NULL DEFAULT '{}',
  client_count   INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Rate policies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bequant_policies (
  name                TEXT PRIMARY KEY,
  policy_id           TEXT NOT NULL,
  rate_dl             INTEGER NOT NULL,
  rate_ul             INTEGER NOT NULL,
  burst_rate_dl       INTEGER,
  burst_rate_ul       INTEGER,
  burst_threshold_dl  INTEGER,
  burst_threshold_ul  INTEGER,
  congestion_mgmt     BOOLEAN NOT NULL DEFAULT false,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Node snapshots (hourly history — aggregate only, NO per-subscriber DPI) ──
CREATE TABLE IF NOT EXISTS bequant_node_snapshots (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  taken_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  volume_dl             DOUBLE PRECISION,
  volume_ul             DOUBLE PRECISION,
  latency_dl            DOUBLE PRECISION,
  latency_ul            DOUBLE PRECISION,
  congestion            DOUBLE PRECISION,
  retransmission_dl     DOUBLE PRECISION,
  retransmission_ul     DOUBLE PRECISION,
  flows_active          INTEGER,
  flows_created         INTEGER,
  traffic_at_max_speed  DOUBLE PRECISION,
  dpi_downlink_top      JSONB NOT NULL DEFAULT '[]'::jsonb,
  dpi_uplink_top        JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_bequant_snap_taken ON bequant_node_snapshots (taken_at DESC);

-- ── Audit log: who looked up which subscriber ───────────────────
CREATE TABLE IF NOT EXISTS bequant_access_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT NOT NULL, -- 'view_subscriber' | 'view_list' | 'test_connection' | 'save_config'
  target_ip   TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bequant_audit_user   ON bequant_access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bequant_audit_target ON bequant_access_log (target_ip, created_at DESC);

-- ============================================
-- RLS — strict
-- ============================================

ALTER TABLE bequant_subscribers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bequant_subscriber_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bequant_policies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bequant_node_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bequant_access_log          ENABLE ROW LEVEL SECURITY;

-- Only admin / infraestructura / gerente can SELECT sync tables.
-- Writes always come from service_role (crons) → RLS bypassed automatically.
CREATE POLICY "bequant_subs_read" ON bequant_subscribers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin', 'infraestructura', 'gerente', 'soporte'))
  );

CREATE POLICY "bequant_groups_read" ON bequant_subscriber_groups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin', 'infraestructura', 'gerente'))
  );

CREATE POLICY "bequant_pol_read" ON bequant_policies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin', 'infraestructura', 'gerente'))
  );

CREATE POLICY "bequant_snap_read" ON bequant_node_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin', 'infraestructura', 'gerente'))
  );

-- Audit: only admins can read, insert is by service_role.
CREATE POLICY "bequant_audit_read" ON bequant_access_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin'))
  );
