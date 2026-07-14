// ============================================================
// Cobro unificado en Bs de TODAS las facturas de un collection_item pagado.
// Fuente ÚNICA compartida por el trigger sincrónico y el cron de reintentos
// (antes estaba duplicada en ambos → derivaban; review adversarial 2026-07-14).
// ============================================================
//
// Enruta cada factura al helper Odoo correcto SEGÚN SU ESTADO VIVO:
//   - `draft`                    → `wuipi_pay_invoice`          (postea + aplica
//     anticipo UNA vez + cobra atómico, sin el matching FIFO del hook de
//     action_post que misruteaba multi-factura → casos reales multi-factura, 2026-07).
//   - `posted` con residual > 0  → `wuipi_pay_invoice_residual` (cobra el residual
//     atómico contra ESA factura y NO toca el anticipo).
//   - `posted` con residual ~0   → skip idempotente (ya pagada).
//
// POR QUÉ el estado VIVO y no el `metadata` (incidente 2026-07-14):
// `wuipi_pay_invoice` revienta con "Está tratando de conciliar algunos asientos
// que ya han sido conciliados" cuando intenta aplicar ANTICIPO sobre una factura
// `posted` que YA tiene una reconciliación parcial. El metadata es un SNAPSHOT del
// momento en que se generó el link (items viven 30-45 días): un `draft` puede
// pasar a `posted/partial` (cobro incompleto en caja) antes de que el cliente
// pague. Enrutar por metadata reproduce el crash sobre la factura nueva.
//
// ECONOMÍA (regla dura: NUNCA inflar el banco — incidente 2026-06-30):
// El portal cobra al cliente `sum(drafts) + residual − anticipo`. Aquí:
// `wuipi_pay_invoice_residual` manda el residual al banco y `wuipi_pay_invoice`
// aplica el anticipo y manda `draft − anticipo` → banco == lo cobrado.

import {
  payInvoice,
  payInvoiceResidual,
  findPaymentForInvoiceByToken,
  getInvoicesLiveState,
  sumPaymentsBsByToken,
} from "@/lib/integrations/odoo";

export interface PayInvoicesFailure {
  invoiceId: number;
  error: string;
}

export interface PayInvoicesBsResult {
  ok: boolean;
  failures: PayInvoicesFailure[];
  /** Cuántas facturas se intentaron (residuales + drafts, sin las ya pagadas). */
  attempted: number;
  /** IDs saltados por estar ya pagados (idempotencia). */
  skippedPaid: number[];
}

/** Una factura se considera cerrada con este margen (céntimos por drift de tasa). */
const DUST = 0.01;

/** ¿La factura quedó cerrada AHORA en Odoo? (relee estado vivo; nunca lanza). */
async function isClosedNow(invoiceId: number): Promise<boolean> {
  try {
    const s = (await getInvoicesLiveState([invoiceId])).get(invoiceId);
    return !!s && s.amountResidual <= DUST;
  } catch {
    return false;
  }
}

/**
 * Cobra en Odoo todas las facturas de un item pagado (solo métodos Bs).
 *
 * @param draftIdsFromMeta   metadata.odoo_invoice_ids (facturas del portal)
 * @param residualIdsFromMeta metadata.odoo_posted_residual_ids (saldo anterior),
 *   YA gateado por el caller (debe estar vacío si al cliente no se le cobró).
 */
export async function payAllInvoicesBs(opts: {
  paymentToken: string;
  journalId?: number;
  draftIdsFromMeta: number[];
  residualIdsFromMeta: number[];
  /** Bs REALMENTE cobrados al cliente (amount_bss / amountVes). Si se pasa, se exige
   *  que lo aplicado en Odoo cuadre con esto antes de dar el item por sincronizado. */
  chargedBs?: number | null;
  logPrefix?: string;
}): Promise<PayInvoicesBsResult> {
  const { paymentToken, journalId, draftIdsFromMeta, residualIdsFromMeta, chargedBs } = opts;
  const log = opts.logPrefix ?? "[payAllInvoicesBs]";
  const failures: PayInvoicesFailure[] = [];
  const skippedPaid: number[] = [];

  const allIds = Array.from(new Set([...draftIdsFromMeta, ...residualIdsFromMeta]))
    .sort((a, b) => a - b); // más vieja primero (ID asc como proxy de antigüedad)
  if (!allIds.length) return { ok: true, failures, attempted: 0, skippedPaid };

  // 1. ESTADO VIVO — enruta por lo que la factura ES ahora, no por el snapshot.
  let live: Map<number, { state: string; amountResidual: number }>;
  try {
    live = await getInvoicesLiveState(allIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Sin estado vivo no podemos enrutar con seguridad → fallar (el cron reintenta).
    return {
      ok: false,
      failures: [{ invoiceId: allIds[0], error: `no se pudo leer estado vivo: ${msg.slice(0, 160)}` }],
      attempted: 0,
      skippedPaid,
    };
  }

  const toResidual: number[] = [];
  const toDraft: number[] = [];
  for (const id of allIds) {
    const s = live.get(id);
    if (!s) { failures.push({ invoiceId: id, error: "factura no existe en Odoo" }); continue; }
    if (s.state === "cancel") { failures.push({ invoiceId: id, error: "factura cancelada en Odoo" }); continue; }
    if (s.amountResidual <= DUST && s.state === "posted") { skippedPaid.push(id); continue; }
    if (s.state === "draft") toDraft.push(id);
    else toResidual.push(id); // posted con residual > 0 → helper de residual
  }

  // 2. RESIDUALES PRIMERO (B2/V1): si posteáramos un draft antes, el auto-reconcile
  //    de `action_post` podría cruzar su pago contra el residual viejo.
  for (const invoiceId of toResidual) {
    const memo = `${paymentToken}#${invoiceId}`;
    try {
      // Pre-flight de HUÉRFANO: un intento anterior pudo dejar un account.payment
      // con ESTE memo (posteado pero sin reconciliar). Crear otro = doble cobro.
      const existing = await findPaymentForInvoiceByToken(invoiceId, paymentToken);
      if (existing) {
        if (await isClosedNow(invoiceId)) { skippedPaid.push(invoiceId); continue; }
        failures.push({
          invoiceId,
          error: `pago ${existing} ya existe con este memo pero la factura sigue con residual — NO duplico, revisar manualmente`,
        });
        continue;
      }
      const r = await payInvoiceResidual(invoiceId, { memo, journalId });
      if (r.success && r.residual_after_bs <= DUST) {
        console.log(`${log} ✅ residual ${invoiceId} cerrado (${r.payment_name})`);
        continue;
      }
      // Tolerancia already_paid: puede haberla cerrado caja entre medias.
      if (await isClosedNow(invoiceId)) { skippedPaid.push(invoiceId); continue; }
      failures.push({ invoiceId, error: `residual no cerró: residual_after=${r.residual_after_bs}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (await isClosedNow(invoiceId)) { skippedPaid.push(invoiceId); continue; }
      failures.push({ invoiceId, error: `residual: ${msg.slice(0, 200)}` });
    }
  }

  // 3. GUARD (#3/V1): si un RESIDUAL falló, NO postear los drafts en esta corrida.
  //    Postearlos dejaría el draft `posted` (y el anticipo consumido) con el residual
  //    viejo aún abierto — estado peor y más difícil de remediar. El cron reintenta
  //    residual-primero (todo es idempotente por memo).
  if (failures.length > 0) {
    return { ok: false, failures, attempted: toResidual.length, skippedPaid };
  }

  // 4. DRAFTS.
  for (const invoiceId of toDraft) {
    try {
      const r = await payInvoice(invoiceId, { journalId, memo: `${paymentToken}#${invoiceId}` });
      if (r.success && (r.alreadyPaid || r.residualAfterBs <= DUST)) {
        console.log(`${log} ✅ pay_invoice ${invoiceId} ${r.alreadyPaid ? "already_paid" : "cerrado " + r.paymentName}${r.excessToAnticipoBs > 0 ? ` (excedente ${r.excessToAnticipoBs}→anticipo)` : ""}`);
        continue;
      }
      if (await isClosedNow(invoiceId)) { skippedPaid.push(invoiceId); continue; }
      failures.push({ invoiceId, error: `pay_invoice no cerró: residual_after=${r.residualAfterBs}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (await isClosedNow(invoiceId)) { skippedPaid.push(invoiceId); continue; }
      failures.push({ invoiceId, error: `pay_invoice: ${msg.slice(0, 200)}` });
      console.error(`${log} pay_invoice ${invoiceId} error:`, err);
    }
  }

  // 5. ASERCIÓN DE CUADRE — lo aplicado en Odoo debe ser == lo cobrado al cliente.
  //
  // Sin esto, varios fallos quedan SILENCIOSOS y el item se marca "synced" con dinero
  // cobrado que NUNCA se registró (review adversarial 2026-07-14):
  //   - `wuipi_pay_invoice` cierra la factura con ANTICIPO y no crea pago, cuando el
  //     portal NO descontó ese anticipo (pago de una factura suelta, is_pay_all=false).
  //   - La factura ya la había cerrado CAJA y la saltamos por idempotencia: el débito
  //     del cliente entró a Mercantil pero no existe account.payment que lo respalde.
  // La suma es CUMULATIVA por memo (`wpy_<token>...`), así que un reintento que solo
  // cierra lo que faltaba también cuadra (cuenta los pagos de corridas anteriores).
  //
  // Tolerancia 2%: absorbe el drift de céntimos por diferencia de tasa (observado
  // ~0,03%) sin dejar pasar un sub-cobro real. No lanza si Odoo falla al sumar: en ese
  // caso preferimos NO bloquear un cobro que sí se aplicó (el cron reintenta).
  if (failures.length === 0 && chargedBs && chargedBs > 0) {
    try {
      const appliedBs = await sumPaymentsBsByToken(paymentToken);
      const minOk = chargedBs * 0.98;
      if (appliedBs < minOk) {
        failures.push({
          invoiceId: allIds[0],
          error: `SUB-COBRO: en Odoo solo se aplicaron ${appliedBs} Bs de los ${chargedBs} Bs cobrados al cliente `
            + `(faltan ~${Math.round((chargedBs - appliedBs) * 100) / 100} Bs). Facturas cerradas por anticipo/caja `
            + `sin respaldo de pago — revisar antes de marcar synced.`,
        });
      }
    } catch (err) {
      console.warn(`${log} no se pudo verificar el cuadre (no bloqueo):`, err);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    attempted: toResidual.length + toDraft.length,
    skippedPaid,
  };
}
