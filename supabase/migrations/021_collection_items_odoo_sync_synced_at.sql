-- 2026-06-03: Marcar cuando el sync sincrónico a Odoo terminó OK para un
-- collection_item. Necesario para que el visor /cobranzas distinga
-- "sin cola porque sync funcionó in-line" de "sin cola porque algo falló
-- silente (huérfano real)".
--
-- Antes del fix de wiring (commit 34100ce, 2026-06-03), el sync sincrónico
-- fallaba contra el Odoo equivocado y los pagos quedaban como huérfanos.
-- Tras el fix, el sync funciona y NO encola → "sin cola" es ahora el
-- estado feliz, no un bug. Sin esta columna el panel sub-reporta el
-- problema real porque cuenta huérfanos sanos como pendientes.

alter table collection_items
  add column if not exists odoo_sync_synced_at timestamptz;

create index if not exists idx_collection_items_sync_synced_at
  on collection_items (odoo_sync_synced_at) where odoo_sync_synced_at is not null;

comment on column collection_items.odoo_sync_synced_at is
  'Set por triggerOdooSyncOrEnqueue cuando el sync sincrónico (post action_post + register_payment) terminó OK sin necesidad de encolar. NULL si: nunca se intentó, falló y se encoló, o item pre-2026-06-03 sin backfill.';
