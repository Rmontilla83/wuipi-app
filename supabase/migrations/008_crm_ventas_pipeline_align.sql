-- ============================================
-- 008: Alinear pipeline CRM Ventas con plan Kommo
-- ============================================
-- Antes (10 etapas): incoming, contacto_inicial, info_enviada, en_instalacion,
--   no_factible, no_concretado, no_clasificado, retirado_reactivacion,
--   prueba_actualizacion, ganado
--
-- Después (7 etapas): incoming, calificacion, propuesta_enviada, datos_contratacion,
--   instalacion_programada, ganado, no_concretado

-- 1. Migrar datos existentes a las nuevas etapas
UPDATE crm_leads SET stage = 'calificacion' WHERE stage = 'contacto_inicial';
UPDATE crm_leads SET stage = 'propuesta_enviada' WHERE stage = 'info_enviada';
UPDATE crm_leads SET stage = 'instalacion_programada' WHERE stage = 'en_instalacion';
UPDATE crm_leads SET stage = 'no_concretado', lost_at = COALESCE(lost_at, now()) WHERE stage = 'no_factible';
UPDATE crm_leads SET stage = 'incoming' WHERE stage = 'no_clasificado';
UPDATE crm_leads SET stage = 'no_concretado', lost_at = COALESCE(lost_at, now()) WHERE stage = 'retirado_reactivacion';
UPDATE crm_leads SET stage = 'incoming' WHERE stage = 'prueba_actualizacion';

-- 2. Reemplazar CHECK constraint
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_stage_check;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_stage_check
  CHECK (stage IN (
    'incoming', 'calificacion', 'propuesta_enviada', 'datos_contratacion',
    'instalacion_programada', 'ganado', 'no_concretado'
  ));
