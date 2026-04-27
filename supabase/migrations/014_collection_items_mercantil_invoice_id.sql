-- ============================================================
-- Migration 014: Mercantil short invoice ID for collection_items
-- ============================================================
-- Mercantil's `invoiceNumber.number` field is capped at 12 characters
-- (Boton de Pagos Web v3.1 spec — confirmed by support 2026-04-27,
-- root cause of error 821). The wpy_<64 hex> payment tokens are 68 chars,
-- so we derive a 12-char ID per item: "WPY-XXXXXXXX" (8 hex chars from
-- the token, uppercased). The mapping is persisted so webhooks can
-- resolve back to the long payment_token.

ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS mercantil_invoice_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_items_mercantil_invoice_id
  ON collection_items(mercantil_invoice_id)
  WHERE mercantil_invoice_id IS NOT NULL;
