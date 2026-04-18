-- Migration 012: allow 'cash' as a payment method for in-office cash payments
-- Admin UI (/api/cobranzas/items/mark-cash) registers when a customer pays
-- in cash at the Puerto La Cruz or Lecheria offices.

ALTER TABLE collection_items
  DROP CONSTRAINT IF EXISTS collection_items_payment_method_check;

ALTER TABLE collection_items
  ADD CONSTRAINT collection_items_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'debito_inmediato'::text,
    'transferencia'::text,
    'stripe'::text,
    'paypal'::text,
    'cash'::text,
    'pending'::text
  ]));
