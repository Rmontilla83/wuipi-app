// ============================================================
// Fase 1 — SALDO ANTERIOR (diseño 2026-07-09)
// ============================================================
//
// Monto Bs FIJO (residual de facturas ya posteadas — típ. cobro incompleto en
// caja) que se suma al cobro para que el cliente pague TODO en un solo pago.
//
// El frozen `amount_bss` NO es fuente de verdad: cada método (débito/
// transferencia/c2p) recalcula `amount_usd × tasa` por su cuenta. Por eso el
// residual se suma en CADA punto de cobro, siempre pasando por este helper para
// mantener la lógica y el gateo en un solo lugar.
//
// Gateado por PORTAL_SALDO_ANTERIOR_ENABLED: con el flag off, SIEMPRE devuelve 0
// → cero impacto en el monto cobrado (byte-idéntico al comportamiento actual).
//
// Server-only: lee process.env sin prefijo NEXT_PUBLIC. NO usar en componentes
// de cliente — el portal recibe el valor por la respuesta de /api/cobranzas/[token].

/**
 * Residual Bs (saldo anterior) a sumar al cobro, leído de
 * `metadata.posted_residual_total_bs`. Devuelve 0 si el flag está off, si no hay
 * metadata, o si el valor no es un número positivo.
 */
export function postedResidualBs(metadata: unknown): number {
  if (process.env.PORTAL_SALDO_ANTERIOR_ENABLED !== "true") return 0;
  const meta =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : null;
  const v = Number(meta?.posted_residual_total_bs ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}
