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
// Gateo (dos niveles):
//   - PORTAL_SALDO_ANTERIOR_ENABLED = "true"  → feature encendido; con OFF SIEMPRE 0.
//   - PORTAL_SALDO_ANTERIOR_PARTNER_WHITELIST = "2404,621" (IDs Odoo, opcional):
//       si está seteado, el feature SOLO aplica a esos partners (E2E scopeado en
//       prod sin exponer al resto). Vacío → aplica a todos (rollout global final).
//
// Server-only: lee process.env sin prefijo NEXT_PUBLIC. NO usar en componentes
// de cliente — el portal recibe el valor por la respuesta de /api/cobranzas/[token].

/** Whitelist de partner IDs (vacío = todos). */
function whitelist(): number[] {
  return (process.env.PORTAL_SALDO_ANTERIOR_PARTNER_WHITELIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** ¿El feature está encendido para ESTE partner? (flag + whitelist). */
export function isSaldoAnteriorEnabledForPartner(partnerId: number): boolean {
  if (process.env.PORTAL_SALDO_ANTERIOR_ENABLED !== "true") return false;
  const wl = whitelist();
  return wl.length === 0 || wl.includes(partnerId);
}

/**
 * Migración al helper universal `wuipi_pay_invoice` (2026-07-09): flag
 * WUIPI_PAY_INVOICE_ENABLED + whitelist WUIPI_PAY_INVOICE_PARTNER_WHITELIST.
 * Con el flag on, el sync (métodos Bs) cobra TODAS las facturas (drafts +
 * saldos anteriores) con `payInvoice` — sin registerPayment/reconcile manual/M2.
 * Off → flujo actual. Rollout E2E → whitelist → global (whitelist vacío).
 */
export function isPayInvoiceMigrationEnabledForPartner(partnerId: number): boolean {
  if (process.env.WUIPI_PAY_INVOICE_ENABLED !== "true") return false;
  const wl = (process.env.WUIPI_PAY_INVOICE_PARTNER_WHITELIST || "")
    .split(",").map((s) => s.trim()).filter(Boolean).map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return wl.length === 0 || wl.includes(partnerId);
}

/**
 * Residual Bs (saldo anterior) a sumar al cobro, leído de
 * `metadata.posted_residual_total_bs`. Devuelve 0 si el flag está off, si el
 * partner (metadata.odoo_partner_id) no está en el whitelist, si no hay metadata,
 * o si el valor no es un número positivo.
 */
export function postedResidualBs(metadata: unknown): number {
  if (process.env.PORTAL_SALDO_ANTERIOR_ENABLED !== "true") return 0;
  const meta =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : null;
  // Whitelist (defensa en profundidad): si está seteado, solo los partners
  // listados. El metadata trae odoo_partner_id (lo pone iniciar).
  const wl = whitelist();
  if (wl.length > 0) {
    const pid = Number(meta?.odoo_partner_id);
    if (!Number.isInteger(pid) || !wl.includes(pid)) return 0;
  }
  const v = Number(meta?.posted_residual_total_bs ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}
