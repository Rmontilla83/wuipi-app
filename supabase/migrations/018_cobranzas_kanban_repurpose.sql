-- =============================================================
-- Migración 018 — Repurpose del kanban Cobranzas para incidencias
-- =============================================================
--
-- El kanban en `crm_collections` se repurposea: ya no es gestion generica
-- de morosos, sino bandeja de incidencias activas con cliente conectado
-- a WhatsApp Cobranzas (numero +584248800723). Cambios:
--
--   1. Stages nuevas (8) reemplazan a las viejas. La tabla esta vacia
--      hoy (0 rows verificado), asi que el reemplazo es seguro.
--   2. client_id pasa a nullable: los clientes vienen de Odoo, no de la
--      tabla local `clients`. Para casos auto-creados desde fallos de
--      pasarela no tenemos un row local que referenciar.
--   3. Columnas nuevas para vincular el caso con su origen y vida util:
--      source_collection_item_id, closed_at, failure_metadata, last_wa_sent_at
--   4. source extendido con 'payment_failure' y 'auto_inbox'.
--   5. Indice unico parcial para idempotencia: no crear 2 casos abiertos
--      para el mismo item de cobranza con la misma stage.
--
-- Nueva tabla `cobranzas_wa_outbox`:
--   Registro de mensajes WhatsApp del RIEL NUEVO de cobranzas. Por defecto
--   los mensajes se generan en modo dry_run (env COBRANZAS_WA_DRY_RUN=true)
--   y SOLO se persisten aqui sin llegar a Meta API. Al activar el envio
--   real (en pruebas progresivas), el status pasa a 'sent' / 'failed' y
--   se registra meta_message_id para reconciliacion.

-- ----- 1. crm_collections — client_id nullable -----------------
ALTER TABLE crm_collections ALTER COLUMN client_id DROP NOT NULL;

-- ----- 2. Columnas nuevas ----------------------------------------
ALTER TABLE crm_collections
  ADD COLUMN source_collection_item_id UUID REFERENCES collection_items(id) ON DELETE SET NULL,
  ADD COLUMN closed_at TIMESTAMPTZ,
  ADD COLUMN failure_metadata JSONB,
  ADD COLUMN last_wa_sent_at TIMESTAMPTZ;

-- ----- 3. Stages nuevas — reemplazo total -----------------------
ALTER TABLE crm_collections DROP CONSTRAINT crm_collections_stage_check;
ALTER TABLE crm_collections ADD CONSTRAINT crm_collections_stage_check
  CHECK (stage IN (
    'falla_pasarela',           -- entry automatico desde fallo de pago
    'requiere_primer_contacto', -- entry para casos manuales/escalaciones
    'en_conversacion',          -- agente WA activo
    'negociando_plan',          -- discutiendo opciones de pago
    'compromiso_pago',          -- cliente prometio pagar (deadline)
    'verificando_pago',         -- cliente reporto pago, falta confirmar
    'resuelto',                 -- cerrado OK
    'ultima_oportunidad'        -- escalacion senior dia 38
  ));

-- Default: cuando se crea un caso auto desde fallo de pasarela arranca
-- en 'falla_pasarela'. Manuales pueden poner cualquier stage al insertar.
ALTER TABLE crm_collections ALTER COLUMN stage SET DEFAULT 'falla_pasarela';

-- ----- 4. source extendido --------------------------------------
ALTER TABLE crm_collections DROP CONSTRAINT crm_collections_source_check;
ALTER TABLE crm_collections ADD CONSTRAINT crm_collections_source_check
  CHECK (source IN (
    'internal',           -- creado manualmente por agente
    'system',             -- creado por sistema (cron, etc.)
    'kommo',              -- migrado desde Kommo (legacy)
    'payment_failure',    -- auto desde fallo de pasarela (Stream A4)
    'auto_inbox'          -- futuro: bot WA escala al kanban (Stream C3)
  ));

-- ----- 5. Idempotencia: no crear 2 casos abiertos por mismo item ---
-- Un fallo de pasarela puede disparar webhook duplicado o carrera entre
-- dos endpoints (ej. webhook Mercantil + abandono detectado por cron).
-- Este indice unico parcial garantiza que solo existe UN caso abierto
-- (closed_at IS NULL) por (collection_item_id, stage).
CREATE UNIQUE INDEX uniq_active_case_per_item_stage
  ON crm_collections (source_collection_item_id, stage)
  WHERE source_collection_item_id IS NOT NULL AND closed_at IS NULL;

-- ----- 6. Indices auxiliares para queries del kanban ------------
CREATE INDEX idx_crm_coll_stage_open
  ON crm_collections (stage, created_at DESC)
  WHERE closed_at IS NULL AND is_deleted = false;

CREATE INDEX idx_crm_coll_source_item
  ON crm_collections (source_collection_item_id)
  WHERE source_collection_item_id IS NOT NULL;

-- =============================================================
-- cobranzas_wa_outbox — registro dry-run de mensajes WA del riel
-- =============================================================

CREATE TABLE cobranzas_wa_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target (telefono enmascarado para visibilidad sin exponer numero completo)
  customer_phone TEXT NOT NULL,
  customer_phone_masked TEXT,
  customer_name TEXT,

  -- Template definido en src/lib/cobranzas/wa-templates.ts. Son templates
  -- que SE REDACTAN aqui y se someten a Meta despues por el equipo humano.
  template_name TEXT NOT NULL,
  template_lang TEXT NOT NULL DEFAULT 'es',
  template_params JSONB,
  fallback_text TEXT,

  -- Contexto: que evento del riel disparo este mensaje
  trigger_event TEXT NOT NULL,
  -- Ej: 'payment_failure_case', 'collection_calendar_d27', 'd1_recordatorio',
  -- 'd5_recordatorio_firme', 'd7_urgente', 'd8_post_corte', 'd15_consulta',
  -- 'd20_promesa_rota', 'd38_ultima_oportunidad', 'manual_test'

  -- Vinculos opcionales para trazabilidad
  collection_item_id UUID REFERENCES collection_items(id) ON DELETE SET NULL,
  crm_collection_id UUID REFERENCES crm_collections(id) ON DELETE SET NULL,

  -- Estado del envio
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',     -- creado, esperando dispatch
    'dry_run',    -- modo dry-run: registrado pero NO enviado a Meta
    'sent',       -- enviado exitosamente via Meta API
    'failed',     -- intento de envio fallo
    'skipped'     -- skipeado (ej. cliente con tilde no_suspender)
  )),

  -- Resultado real del envio (cuando se desactive dry-run)
  sent_at TIMESTAMPTZ,
  meta_message_id TEXT,
  meta_response JSONB,
  error_message TEXT,

  -- Audit
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wao_status ON cobranzas_wa_outbox (status, created_at DESC);
CREATE INDEX idx_wao_trigger ON cobranzas_wa_outbox (trigger_event, created_at DESC);
CREATE INDEX idx_wao_item ON cobranzas_wa_outbox (collection_item_id) WHERE collection_item_id IS NOT NULL;
CREATE INDEX idx_wao_crm_collection ON cobranzas_wa_outbox (crm_collection_id) WHERE crm_collection_id IS NOT NULL;

-- RLS: lectura solo administrativos
ALTER TABLE cobranzas_wa_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wao_admin_read" ON cobranzas_wa_outbox FOR SELECT
  USING (
    ((auth.jwt() -> 'app_metadata' ->> 'role') = ANY (ARRAY[
      'super_admin', 'admin', 'gerente', 'finanzas'
    ]))
  );

-- INSERT/UPDATE/DELETE: solo service_role (bypasea RLS).
-- Lo escribe el helper en backend, no hay UI directa de creacion.

COMMENT ON TABLE cobranzas_wa_outbox IS
  'Registro de mensajes WhatsApp del riel de cobranzas. Por defecto dry_run=true (no llega a Meta).';
COMMENT ON COLUMN cobranzas_wa_outbox.dry_run IS
  'true=NO se envia a Meta, solo se registra. Cambia a false cuando estemos seguros.';
COMMENT ON COLUMN cobranzas_wa_outbox.trigger_event IS
  'Identifica que evento del riel disparo el mensaje (calendario / fallo / etc.)';
