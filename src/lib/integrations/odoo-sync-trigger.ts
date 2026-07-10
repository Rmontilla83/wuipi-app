// ============================================================
// Helper compartido — disparar sync Odoo desde cualquier endpoint
// que marque un collection_item como paid.
// ============================================================
//
// Llamado desde:
//   - /api/mercantil/route.ts (debito_inmediato — Botón Web)
//   - /api/cobranzas/pay/confirm/route.ts (transferencia)
//   - /api/cobranzas/pay/c2p-confirm/route.ts (c2p)
//   - /api/cobranzas/webhook/stripe/route.ts (stripe)
//   - /api/cobranzas/webhook/paypal/route.ts (paypal)
//   - /api/cron/transfer-search-retry/route.ts (transferencia, reintento)
//
// Comportamiento:
//   1. Verifica kill switch ODOO_SYNC_ENABLED
//   2. Lookup partner Odoo (por cedula, fallback email)
//   3. Verifica whitelist
//   4. Lookup factura draft mas reciente del partner
//   5. Intento sincronico al sync (timeout largo de Odoo, max 60s)
//   6. Si falla -> encola en odoo_sync_queue para reintento async
//
// NUNCA lanza — todos los errores se manejan internamente. El caller (webhook
// Mercantil, etc.) siempre debe poder responder 200 al evento entrante.

import {
  syncOdooForCollectionItem,
  findOdooPartnerByIdentifiers,
  findLatestDraftInvoiceForPartner,
  payInvoiceResidual,
  payInvoice,
  PAYMENT_METHOD_MAPPING,
  isMultiCurrencyMethod,
  computeProratedAmounts,
  getPartnerAnticipo,
} from "@/lib/integrations/odoo";
import { isPayInvoiceMigrationEnabledForPartner } from "@/lib/cobranzas/saldo-anterior";
import { enqueueOdooSync } from "@/lib/dal/odoo-sync-queue";
import { createAdminSupabase } from "@/lib/supabase/server";

export interface SyncTriggerInput {
  /** UUID del collection_item ya marcado como paid */
  collectionItemId: string;
  /** "WPY-XXXXXXXX" — para trazabilidad y memo del payment en Odoo */
  paymentToken: string;
  /** Cédula/RIF del cliente para lookup de partner Odoo */
  customerCedulaRif: string;
  /** Email opcional como fallback del lookup */
  customerEmail?: string | null;
  /** Método: debe matchear las keys de PAYMENT_METHOD_MAPPING */
  paymentMethod: string;
  /** Referencia bancaria (si aplica) */
  paymentReference?: string | null;
  /** Monto USD del item (para audit) */
  amountUsd?: number | null;
  /** Monto VES (si el pago fue en VES) */
  amountVes?: number | null;
  /** Fecha del pago (YYYY-MM-DD), default hoy */
  paymentDate?: string;
  /** IDs de facturas Odoo a postear (de metadata.odoo_invoice_ids).
   *  Si se pasa, el sync postea CADA una. Si no, busca la draft mas reciente. */
  odooInvoiceIds?: number[] | null;
  /** Mapa { invoiceId: amount_usd } de metadata.odoo_invoice_amounts_usd.
   *  Usado para PRORRATEAR el `amountUsd` total entre las N facturas cuando es
   *  multi-moneda (Stripe/PayPal). Sin este mapa con multi-moneda multi-factura,
   *  el sync aplicaría el monto total a CADA factura → sobrepayment N veces.
   *  Items legacy sin este mapa caen al split equitativo + warning. */
  invoiceAmountsUsd?: Record<number, number> | null;
}

export async function triggerOdooSyncOrEnqueue(input: SyncTriggerInput): Promise<void> {
  const {
    collectionItemId,
    paymentToken,
    customerCedulaRif,
    customerEmail,
    paymentMethod,
    paymentReference,
    amountUsd,
    amountVes,
    paymentDate,
  } = input;

  // 1. Validar que el método tenga mapping (sino no podemos sincronizar)
  if (!PAYMENT_METHOD_MAPPING[paymentMethod]) {
    console.warn(`[OdooSyncTrigger] Metodo "${paymentMethod}" sin mapping. Skip sync.`);
    return;
  }

  // 2. Kill switch
  if (process.env.ODOO_SYNC_ENABLED !== "true") {
    console.log(`[OdooSyncTrigger] ODOO_SYNC_ENABLED=false — skip ${collectionItemId}`);
    return;
  }

  // 3. Lookup partner
  let odooPartnerId: number | null = null;
  try {
    odooPartnerId = await findOdooPartnerByIdentifiers({
      vat: customerCedulaRif,
      email: customerEmail,
    });
  } catch (err) {
    console.warn("[OdooSyncTrigger] Lookup partner fallo:", err);
  }
  if (!odooPartnerId) {
    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId: null, odooInvoiceId: null,
      error: `Partner no encontrado en Odoo (cedula=${customerCedulaRif} email=${customerEmail || "-"})`,
    });
    return;
  }

  // 4. Whitelist
  const whitelist = (process.env.ODOO_SYNC_PARTNER_WHITELIST || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(Number);
  if (whitelist.length > 0 && !whitelist.includes(odooPartnerId)) {
    console.log(`[OdooSyncTrigger] Partner ${odooPartnerId} no en whitelist — skip`);
    return;
  }

  // 5. Determinar invoiceIds a procesar
  // Prioridad: si el caller paso odooInvoiceIds (pago parcial), usar esos.
  // Sino, buscar la draft mas reciente del partner.
  let invoiceIds: number[] = [];
  if (Array.isArray(input.odooInvoiceIds) && input.odooInvoiceIds.length > 0) {
    invoiceIds = input.odooInvoiceIds.map(Number).filter(n => Number.isInteger(n) && n > 0);
  } else {
    try {
      const single = await findLatestDraftInvoiceForPartner(odooPartnerId);
      if (single) invoiceIds = [single];
    } catch (err) {
      console.warn("[OdooSyncTrigger] Lookup invoice fallo:", err);
    }
  }

  if (invoiceIds.length === 0) {
    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId, odooInvoiceId: null,
      error: `Sin factura draft para partner ${odooPartnerId}`,
    });
    return;
  }

  const isMultiCur = isMultiCurrencyMethod(paymentMethod);
  const failures: Array<{ invoiceId: number; error: string }> = [];

  // ── MIGRACIÓN a wuipi_pay_invoice (flag WUIPI_PAY_INVOICE_ENABLED) ────────────
  // Flujo UNIFICADO Bs: cobra TODAS las facturas (drafts + saldos anteriores) con
  // el helper atómico wuipi_pay_invoice — postea + auto-aplica anticipo + cobra el
  // residual, SIN el matching de drafts del hook (que desviaba pagos a anticipo en
  // multi-factura → casos Massimo/Gustavo/Emilio). Elimina M2, B1, registerPayment
  // + reconcile manual. amount_bs omitido = residual exacto post-anticipo. Solo Bs
  // (USD/Stripe/PayPal sigue el flujo de abajo). Flag off → flujo actual intacto.
  if (!isMultiCur && isPayInvoiceMigrationEnabledForPartner(odooPartnerId)) {
    const journalId = PAYMENT_METHOD_MAPPING[paymentMethod]?.journalId;
    const residualIds = process.env.PORTAL_SALDO_ANTERIOR_ENABLED === "true"
      ? (await readPostedResidualInfo(collectionItemId)).ids
      : [];
    // Todas las facturas, más vieja primero (ID asc como proxy de antigüedad, Q5).
    const allIds = Array.from(new Set([...invoiceIds, ...residualIds])).sort((a, b) => a - b);
    for (const invoiceId of allIds) {
      try {
        const r = await payInvoice(invoiceId, { journalId, memo: `${paymentToken}#${invoiceId}` });
        if (r.success && (r.alreadyPaid || r.residualAfterBs <= 0.01)) {
          console.log(`[OdooSyncTrigger] ✅ ${collectionItemId} pay_invoice ${invoiceId} ${r.alreadyPaid ? "already_paid" : "cerrado " + r.paymentName}${r.excessToAnticipoBs > 0 ? ` (excedente ${r.excessToAnticipoBs}→anticipo)` : ""}`);
        } else {
          failures.push({ invoiceId, error: `pay_invoice no cerró: residual_after=${r.residualAfterBs}` });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        failures.push({ invoiceId, error: `pay_invoice: ${errMsg.slice(0, 200)}` });
        console.error(`[OdooSyncTrigger] pay_invoice ${invoiceId} error:`, err);
      }
    }
    if (failures.length > 0) {
      await safeEnqueue({
        collectionItemId, paymentToken, paymentMethod, paymentReference,
        amountUsd, amountVes, paymentDate,
        odooPartnerId, odooInvoiceId: failures[0].invoiceId,
        error: `wuipi_pay_invoice: ${failures.length}/${allIds.length} fallaron: ${failures.map(f => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1400)}`,
      });
      return;
    }
    await markCollectionItemSyncedNow(collectionItemId);
    return;
  }

  // ── Fase 1 — SALDO ANTERIOR: residuales posteados PRIMERO ────────────────────
  // Se cobran con wuipi_pay_invoice_residual (helper Odoo, recomendado 2026-07-09):
  // crea+postea+reconcilia ATÓMICO contra la factura, SIN pasar por el matching de
  // drafts del hook de action_post (que enrutaría el pago a anticipo — bug detectado
  // en el E2E 2026-07-09). Idempotente por memo wpy_. amount_bs omitido → paga el
  // residual VIVO completo (evita el stale del congelado). Solo misma moneda (Bs);
  // flag off → residualTotalBs=0, ids=[] (byte-idéntico). Procesados antes de M2 y de
  // los drafts (B2: si M2 desvía los drafts, el residual ya quedó cobrado).
  let residualTotalBs = 0;
  if (process.env.PORTAL_SALDO_ANTERIOR_ENABLED === "true" && !isMultiCur) {
    const residualInfo = await readPostedResidualInfo(collectionItemId);
    residualTotalBs = residualInfo.totalBs;
    const residualJournalId = PAYMENT_METHOD_MAPPING[paymentMethod]?.journalId;
    for (const invoiceId of residualInfo.ids) {
      try {
        const r = await payInvoiceResidual(invoiceId, {
          memo: `${paymentToken}#${invoiceId}`,
          journalId: residualJournalId,
        });
        if (r.success && r.residual_after_bs <= 0.01) {
          console.log(`[OdooSyncTrigger] ✅ ${collectionItemId} residual invoice=${invoiceId} cerrado (${r.payment_name})`);
        } else {
          failures.push({ invoiceId, error: `residual no cerró: residual_after=${r.residual_after_bs}` });
        }
      } catch (err) {
        // UserError del helper (o error de red). El cron reintenta (idempotente).
        const errMsg = err instanceof Error ? err.message : String(err);
        failures.push({ invoiceId, error: `residual: ${errMsg.slice(0, 200)}` });
        console.error(`[OdooSyncTrigger] residual invoice=${invoiceId} error:`, err);
      }
    }
  }

  // #3 (review) — si algún RESIDUAL falló, NO seguir a postear los drafts en esta
  // corrida: preserva el orden "residuales primero" (V1). El cron reintenta
  // residual-first (idempotente por memo).
  if (failures.length > 0) {
    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId, odooInvoiceId: failures[0].invoiceId,
      error: `Saldo anterior — residual(es) fallaron antes de postear drafts: ${failures.map(f => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1200)}`,
    });
    return;
  }

  // M2 — Multi-DRAFT + saldo a favor: el reparto del anticipo entre N drafts NO
  // está automatizado → revisión manual (los residuales ya se procesaron arriba,
  // por eso NO se pierden). Incidente 2026-06-30.
  if (invoiceIds.length > 1) {
    try {
      const a = await getPartnerAnticipo(odooPartnerId);
      if (a.has_anticipo && a.bs > 0.01) {
        await safeEnqueue({
          collectionItemId, paymentToken, paymentMethod, paymentReference,
          amountUsd, amountVes, paymentDate,
          odooPartnerId, odooInvoiceId: invoiceIds[0],
          error: `Multi-draft (${invoiceIds.length}) con saldo a favor (Bs ${a.bs}) — revisión manual: reparto de anticipo no automatizado (no inflar banco).${failures.length ? ` (residual(es) ${failures.map(f => f.invoiceId).join(",")} fallaron — el cron reintenta)` : ``}`,
        });
        return;
      }
    } catch (err) {
      console.warn("[OdooSyncTrigger] M2 check anticipo multi-factura fallo:", err);
    }
  }

  // 6. Calcular el `amountUsd` que recibe CADA factura.
  //
  // Caso A — misma moneda (transferencia, débito, c2p, cash_ves):
  //   El sync ignora `amountUsd` y usa `invoice.amount_total` (en VES) para
  //   crear el payment. Pasamos `undefined` por factura. La suma de los
  //   payments == suma de invoice.amount_total == total cobrado.
  //
  // Caso B — multi-moneda (Stripe/PayPal/cash_usd):
  //   El sync DEPENDE de `amountUsd` para crear el payment USD contra la
  //   factura VES. Si pasáramos `amountUsd` total a CADA factura → 3
  //   payments de $30 c/u en vez de 3 de $10. Bug. Prorrateamos:
  //   - Con `invoiceAmountsUsd` válido → reparto proporcional al amount_total
  //     USD de cada factura (preserva el hecho de que facturas pueden tener
  //     montos distintos).
  //   - Sin el mapa (item legacy con >1 factura) → split equitativo +
  //     warning. Muy raro: items legacy con multi-factura ya pagados son
  //     casos pasados; nuevos items siempre traen el mapa.
  let proratedByInvoice: Record<number, number> = {};
  if (isMultiCur && typeof amountUsd === "number" && amountUsd > 0) {
    proratedByInvoice = computeProratedAmounts(invoiceIds, input.invoiceAmountsUsd ?? null, amountUsd);
    if (invoiceIds.length > 1) {
      const hasMap = input.invoiceAmountsUsd
        && invoiceIds.every(id => typeof input.invoiceAmountsUsd?.[id] === "number");
      if (!hasMap) {
        console.warn(
          `[OdooSyncTrigger] Item ${collectionItemId} multi-moneda con ${invoiceIds.length} facturas SIN ` +
          `invoiceAmountsUsd map → split equitativo $${(amountUsd / invoiceIds.length).toFixed(2)} c/u. ` +
          `Item probablemente legacy. Prorrateo proporcional requiere metadata.odoo_invoice_amounts_usd.`
        );
      }
      console.log(
        `[OdooSyncTrigger] Item ${collectionItemId} prorrateo multi-moneda total=$${amountUsd}: ` +
        invoiceIds.map(id => `inv${id}=$${proratedByInvoice[id]}`).join(", ")
      );
    }
  }

  // B1 — NO INFLAR BANCO. El monto Bs congelado (amountVes) INCLUYE el residual.
  // El draft debe cobrarse solo por SU porción (amountVes − residual); el residual
  // ya se registró arriba por su amount_residual exacto. Sin restar, con anticipo el
  // pago del draft registra el residual OTRA VEZ → banco inflado (incidente 2026-06-30,
  // que M2 no atrapa con 1 solo draft). Flag off → residualTotalBs=0 → idéntico al previo.
  let draftVesPaid: number | null = null;
  if (invoiceIds.length === 1) {
    if (residualTotalBs > 0) {
      const net = Math.round(((amountVes ?? 0) - residualTotalBs) * 100) / 100;
      draftVesPaid = net > 0.01 ? net : null;
    } else {
      draftVesPaid = amountVes ?? null;
    }
  }

  // 7. Sync sincronico — iterar cada draft. Cada una se postea + tiene su propio
  // account.payment + reconcile. Si una falla, encolamos solo esa.
  for (const invoiceId of invoiceIds) {
    try {
      // Para multi-moneda: monto prorrateado por factura.
      // Para misma moneda: undefined (sync usa invoice.amount_total / amount_residual).
      const amountUsdForInvoice = isMultiCur ? proratedByInvoice[invoiceId] : undefined;

      const result = await syncOdooForCollectionItem({
        invoiceId,
        paymentMethod,
        paymentReference: paymentReference || "",
        paymentToken,
        paymentDate,
        amountUsd: amountUsdForInvoice,
        // Monto real cobrado en Bs (flujo de anticipo), YA neto del residual (B1).
        amountVesPaid: draftVesPaid,
      });

      if (result.ok) {
        console.log(`[OdooSyncTrigger] ✅ ${collectionItemId} invoice=${invoiceId} sync OK state=${result.invoice_payment_state}`);
      } else {
        failures.push({ invoiceId, error: result.error || "sync fallo" });
        console.warn(`[OdooSyncTrigger] invoice=${invoiceId} fallo: ${result.error}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      failures.push({ invoiceId, error: `exception: ${errMsg}` });
      console.error(`[OdooSyncTrigger] invoice=${invoiceId} exception:`, err);
    }
  }

  // (Los residuales del saldo anterior ya se procesaron ARRIBA, antes de M2 y
  // de los drafts — ver bloque "SALDO ANTERIOR: residuales posteados PRIMERO".)

  // Si hubo cualquier falla, encolar para reintentos. La cola tiene UNIQUE
  // en collection_item_id, asi que solo encolamos UNA fila con la primera
  // factura fallida — el cron va a reintentar y la idempotencia parcial
  // (post_invoice_done/register_payment_done) maneja las que ya OK.
  if (failures.length > 0) {
    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId, odooInvoiceId: failures[0].invoiceId,
      error: `${failures.length}/${invoiceIds.length} fallaron: ${failures.map(f => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1500)}`,
    });
    return;
  }

  // Todas las facturas se sincronizaron OK sin encolar. Marcar el item
  // como sincronizado in-line para que el visor /cobranzas no lo cuente
  // como huérfano (introducido 2026-06-03 — ver migración 021).
  await markCollectionItemSyncedNow(collectionItemId);
}

async function markCollectionItemSyncedNow(collectionItemId: string): Promise<void> {
  try {
    const db = createAdminSupabase();
    await db
      .from("collection_items")
      .update({ odoo_sync_synced_at: new Date().toISOString() })
      .eq("id", collectionItemId);
  } catch (err) {
    // No bloqueante — el sync ya fue exitoso, solo perdemos el flag visual.
    console.warn(`[OdooSyncTrigger] No se pudo marcar odoo_sync_synced_at en ${collectionItemId}:`, err);
  }
}

/**
 * Lee del metadata del collection_item los residuales del saldo anterior: los IDs
 * de factura y el TOTAL Bs congelado (para restarlo del amountVesPaid del draft, B1).
 * Devuelve vacío si no hay o si algo falla (no bloqueante). Fase 1 (2026-07-09).
 */
async function readPostedResidualInfo(
  collectionItemId: string,
): Promise<{ ids: number[]; totalBs: number }> {
  try {
    const db = createAdminSupabase();
    const { data } = await db
      .from("collection_items")
      .select("metadata")
      .eq("id", collectionItemId)
      .maybeSingle();
    const meta = (data?.metadata ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(meta.odoo_posted_residual_ids)
      ? (meta.odoo_posted_residual_ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const totalBs = Math.round((Number(meta.posted_residual_total_bs) || 0) * 100) / 100;
    return { ids, totalBs };
  } catch (err) {
    console.warn(`[OdooSyncTrigger] readPostedResidualInfo fallo ${collectionItemId}:`, err);
    return { ids: [], totalBs: 0 };
  }
}

/**
 * Helper para los 8 callers: extrae `odoo_invoice_ids` + `odoo_invoice_amounts_usd`
 * del `metadata` de un collection_item, validando tipos. Devuelve null cuando no
 * hay datos válidos (item legacy o pago con factura única implícita).
 */
export function extractInvoiceSyncFields(
  metadata: unknown,
): { odooInvoiceIds: number[] | null; invoiceAmountsUsd: Record<number, number> | null } {
  const meta = (metadata && typeof metadata === "object") ? (metadata as Record<string, unknown>) : null;
  if (!meta) return { odooInvoiceIds: null, invoiceAmountsUsd: null };

  const odooInvoiceIds = Array.isArray(meta.odoo_invoice_ids)
    ? (meta.odoo_invoice_ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0)
    : null;

  let invoiceAmountsUsd: Record<number, number> | null = null;
  if (meta.odoo_invoice_amounts_usd && typeof meta.odoo_invoice_amounts_usd === "object") {
    const raw = meta.odoo_invoice_amounts_usd as Record<string, unknown>;
    const parsed: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      const amt = Number(v);
      if (Number.isInteger(id) && id > 0 && Number.isFinite(amt) && amt > 0) {
        parsed[id] = amt;
      }
    }
    if (Object.keys(parsed).length > 0) invoiceAmountsUsd = parsed;
  }

  return {
    odooInvoiceIds: odooInvoiceIds && odooInvoiceIds.length > 0 ? odooInvoiceIds : null,
    invoiceAmountsUsd,
  };
}

async function safeEnqueue(opts: {
  collectionItemId: string;
  paymentToken: string;
  paymentMethod: string;
  paymentReference?: string | null;
  amountUsd?: number | null;
  amountVes?: number | null;
  paymentDate?: string;
  odooPartnerId: number | null;
  odooInvoiceId: number | null;
  error: string;
}): Promise<void> {
  try {
    await enqueueOdooSync({
      collection_item_id: opts.collectionItemId,
      odoo_partner_id: opts.odooPartnerId,
      odoo_invoice_id: opts.odooInvoiceId,
      payment_method: opts.paymentMethod,
      payment_reference: opts.paymentReference ?? null,
      payment_token: opts.paymentToken,
      payment_date: opts.paymentDate ?? null,
      amount_usd: opts.amountUsd ?? null,
      amount_ves: opts.amountVes ?? null,
      initial_error: opts.error,
    });
    console.log(`[OdooSyncTrigger] Item ${opts.collectionItemId} encolado`);
  } catch (err) {
    console.error(`[OdooSyncTrigger] Falló enqueue para ${opts.collectionItemId}:`, err);
  }
}
