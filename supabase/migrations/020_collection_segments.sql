-- 020_collection_segments.sql
-- Introduce el modelo de SEGMENTOS para campañas de cobranzas.
--
-- Contexto (auditoría 2026-05-14): el flujo previo solo soportaba 2 filtros
-- (nombre + monto mínimo). Necesitamos filtrar exhaustivamente para lanzar
-- campañas dirigidas (morosos +30 días, jurídicos con >$500, etc).
--
-- Modelo:
--  - `collection_segments` = filtros JSON guardados, reusables. Smart list.
--  - `collection_campaigns.segment_id` = vínculo opcional al segmento que
--    originó la campaña. La campaña sigue siendo el SNAPSHOT al momento de
--    ejecución (sus items se materializan, no se recalculan dinámicamente).
--  - `snapshot_filters` = copia del JSON al momento de ejecutar (para audit
--    si el segmento se modifica luego).
--
-- Cleanup en la misma migración:
--  - Renombrar `collection_notifications` (32 rows pero sin lectura activa
--    desde el código — Cobranzas C1a usa `whatsapp_outbox` separada). Se
--    preserva como `_deprecated_collection_notifications` por si necesitamos
--    la data histórica. DROP definitivo en migración futura cuando se
--    confirme que nadie la lee.
--  - Archivar las 6 campañas "campaña prueba montilla" de marzo 2026 (rename
--    + status=cancelled). NO DELETE — preserva los items históricos. La
--    campaña 6cdaf241 con 2 cobros reales también queda archivada con marca.

-- ────────────────────────────────────────────────────────────────────────
-- 1. CREATE collection_segments
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_segments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,

  -- JSON con la combinatoria de filtros. Shape esperado (todos opcionales):
  -- {
  --   "amount_total":       { "min": 50, "max": 500 },     -- adeudado por cliente USD
  --   "amount_per_invoice": { "min": 10 },                  -- monto de cada factura USD
  --   "overdue_days":       { "min": 30, "max": 90 },       -- días de mora vs hoy
  --   "due_date":           { "from": "2026-03-01", "to": "2026-04-30" },
  --   "draft_count":        { "min": 2, "max": 10 },        -- cantidad de drafts del cliente
  --   "doc_type":           ["V","J","G","E","P"],          -- tipo de documento
  --   "is_company":         true,                            -- solo personas o empresas
  --   "has_email":          true,                            -- canal email disponible
  --   "has_phone":          true,                            -- canal WA disponible
  --   "city":               "Lechería",                      -- ilike
  --   "exclude_credit":     true,                            -- excluir clientes con saldo a favor
  --   "subscription_state": ["3_progress"],                  -- estado suscripción
  --   "billed_month":       ["Marzo","Abril"],               -- mes facturado
  --   "include_partner_ids": [27804, 26732],                 -- whitelist explícita
  --   "exclude_partner_ids": [12345]                          -- blacklist
  -- }
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Anti-spam: no incluir clientes que recibieron campaña en los últimos N días.
  -- 0 = desactivado. Por segmento porque cada caso de uso tiene cadencia distinta
  -- ("morosos +30" puede excluir 7 días, "recordatorio mensual" 25 días).
  exclude_recent_days int NOT NULL DEFAULT 0,

  -- Cache del último preview (clientes que cumplen + total USD). Se actualiza
  -- al llamar /api/cobranzas/segments/preview o al ejecutar el segmento.
  -- Sirve para mostrar count en la lista sin pegarle a Odoo.
  preview_count int,
  preview_total_usd numeric,
  preview_updated_at timestamptz,

  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index para listar segmentos activos rápido
CREATE INDEX IF NOT EXISTS idx_collection_segments_active
  ON collection_segments(created_at DESC)
  WHERE is_archived = false;

-- RLS: solo authenticated users pueden ver/escribir. La autorización fina
-- (admin/finanzas) se hace en la API via requirePermission.
ALTER TABLE collection_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "collection_segments_authenticated_all" ON collection_segments;
CREATE POLICY "collection_segments_authenticated_all"
  ON collection_segments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Trigger para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_collection_segments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_collection_segments_updated_at ON collection_segments;
CREATE TRIGGER trg_collection_segments_updated_at
  BEFORE UPDATE ON collection_segments
  FOR EACH ROW EXECUTE FUNCTION update_collection_segments_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- 2. ALTER collection_campaigns — vincular a segmento + audit
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE collection_campaigns
  ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES collection_segments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_filters jsonb,        -- copia de filters al momento de ejecutar
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,        -- cuándo se materializaron los items
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;       -- envío programado (futuro)

CREATE INDEX IF NOT EXISTS idx_collection_campaigns_segment_id
  ON collection_campaigns(segment_id)
  WHERE segment_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3. CLEANUP: deprecar collection_notifications (preserva data)
-- ────────────────────────────────────────────────────────────────────────

-- 32 rows actualmente. Sin código que las lea (verificado 2026-05-14: WA
-- outbox vive en `whatsapp_outbox`). Renombramos en lugar de DROP para
-- permitir restore si alguien la usa que no detectamos.
ALTER TABLE IF EXISTS collection_notifications
  RENAME TO _deprecated_collection_notifications;

COMMENT ON TABLE _deprecated_collection_notifications IS
  'Deprecada 2026-05-14: WA outbox vive en whatsapp_outbox. DROP definitivo cuando se confirme que no hay lecturas en producción por ~2 semanas.';

-- ────────────────────────────────────────────────────────────────────────
-- 4. CLEANUP: archivar campañas test "montilla" de marzo
-- ────────────────────────────────────────────────────────────────────────

-- 6 campañas con nombre exacto "campaña prueba montilla", todas creadas en
-- una tarde de testing del 2026-03-26. 5 sin pagos reales, 1 con $3 USD
-- cobrados. Las archivamos (status=cancelled + rename) para que no
-- contaminen la lista de campañas activas. Items NO se borran — son
-- parte del histórico.
UPDATE collection_campaigns
SET status = 'cancelled',
    name = '[ARCHIVED 2026-05-14] ' || name || ' — test marzo',
    description = COALESCE(description, '') ||
                  E'\n[Archivado por migración 020 — testing data del 26-03-2026, no usar]'
WHERE name = 'campaña prueba montilla'
  AND created_at >= '2026-03-26'
  AND created_at < '2026-03-27';
