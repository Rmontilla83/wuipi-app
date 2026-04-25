-- Migration 013: allow 'c2p' as a payment method for Pago Movil C2P payments
-- Portal /pagar/[token] expone el flujo C2P (3 pasos: identidad -> OTP -> confirmar)
-- procesado por POST /api/cobranzas/pay (method=c2p) + /api/cobranzas/pay/c2p-confirm.

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
    'c2p'::text,
    'pending'::text
  ]));
