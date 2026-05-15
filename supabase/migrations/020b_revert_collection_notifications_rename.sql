-- 020b_revert_collection_notifications_rename.sql
--
-- Revierte el rename hecho en 020 (collection_notifications →
-- _deprecated_collection_notifications). Razón: el endpoint
-- /api/cobranzas/send usa createNotification/updateNotification
-- activamente al enviar campañas. La auditoría inicial detectó "sin
-- lecturas" pero pasó por alto los INSERTs del envío.
--
-- Sin esta tabla con su nombre original, intentar enviar una campaña
-- falla con "relation collection_notifications does not exist".
--
-- Estado tras esta migración:
--  - collection_notifications EXISTE con sus 32 rows preservados.
--  - Envíos de campañas vuelven a funcionar.
--  - El cleanup definitivo de esta tabla queda pendiente: requiere
--    primero migrar createNotification/updateNotification a usar
--    whatsapp_outbox o eliminarlas si no aportan info que ya no esté
--    en payment_gateway_logs.

ALTER TABLE IF EXISTS _deprecated_collection_notifications
  RENAME TO collection_notifications;

COMMENT ON TABLE collection_notifications IS NULL;
