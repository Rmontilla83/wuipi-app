-- ============================================
-- Migration 010: Bequant per-subscriber monthly DPI (Option B)
-- ============================================
-- Aggregated app-usage pattern per subscriber per month.
-- Populated by weekly-rotation cron (1/7 of base per day).
-- Retention: 12 months rolling (purge cron monthly).
--
-- Privacy note: this replaces the prior "no per-subscriber DPI" rule
-- with an aggregated-monthly approach (top 10 apps, no per-flow data).
-- Access restricted to admin/super_admin/infra/gerente/soporte with audit log.
-- ============================================

CREATE TABLE IF NOT EXISTS bequant_subscriber_dpi_monthly (
  ip              TEXT NOT NULL,
  year_month      TEXT NOT NULL,          -- format 'YYYY-MM'
  top_dl          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name, bytes}, ...] top 10
  top_ul          JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_dl_bytes  BIGINT NOT NULL DEFAULT 0,
  total_ul_bytes  BIGINT NOT NULL DEFAULT 0,
  days_sampled    INTEGER NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip, year_month)
);

-- Retention cleanup + query by subscriber over time
CREATE INDEX IF NOT EXISTS idx_dpi_monthly_year ON bequant_subscriber_dpi_monthly (year_month);
CREATE INDEX IF NOT EXISTS idx_dpi_monthly_ip   ON bequant_subscriber_dpi_monthly (ip, year_month DESC);

ALTER TABLE bequant_subscriber_dpi_monthly ENABLE ROW LEVEL SECURITY;

-- Read: admin / super_admin / infra / gerente / soporte
CREATE POLICY "bequant_dpi_monthly_read" ON bequant_subscriber_dpi_monthly
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('admin', 'super_admin', 'infraestructura', 'gerente', 'soporte'))
  );

-- Writes only via service_role (crons bypass RLS).
