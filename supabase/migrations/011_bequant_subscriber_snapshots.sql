-- ============================================
-- Migration 011: Per-subscriber live-metric snapshots (portal fallback)
-- ============================================
-- Stores the most recent non-(-1) BQN measurement per IP so the portal
-- (and any admin UI) can fall back to a known-good value when the BQN
-- is slow or down. Same pattern as bequant_node_snapshots but per-subscriber.
-- Writes exclusively via service_role (cron /api/bequant/cron/subscriber-snapshot).
-- NO DPI here — privacy (CONATEL). Only aggregate speed/latency/stability.
-- ============================================

CREATE TABLE IF NOT EXISTS bequant_subscriber_snapshots (
  ip                    TEXT PRIMARY KEY,
  download_kbps         DOUBLE PRECISION,
  upload_kbps           DOUBLE PRECISION,
  latency_ms            DOUBLE PRECISION,
  retransmission_pct    DOUBLE PRECISION,
  congestion_pct        DOUBLE PRECISION,
  traffic_at_max_speed  DOUBLE PRECISION,
  score                 INTEGER,
  plan_mbps             INTEGER,
  taken_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bequant_sub_snap_taken ON bequant_subscriber_snapshots (taken_at DESC);

ALTER TABLE bequant_subscriber_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: same roles as bequant_subscribers (admin stuff). Portal reads via service_role.
CREATE POLICY "bequant_sub_snap_read" ON bequant_subscriber_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin', 'infraestructura', 'gerente', 'soporte'))
  );

-- Writes always via service_role (cron). RLS bypass automatic.
