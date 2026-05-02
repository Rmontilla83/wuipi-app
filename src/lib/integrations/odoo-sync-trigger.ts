// ============================================================
// Helper compartido — disparar sync Odoo desde cualquier endpoint
// que marque un collection_item como paid.
// ============================================================
//
// Llamado desde:
//   - /api/mercantil/route.ts (debito_inmediato — Botón Web)
//   - /api/cobranzas/pay/confirm/route.ts (transferencia)
//   - /api/cobranzas/pay/c2p-confirm/route.ts (c2p)
//   - /api/cobranzas/items/mark-cash/route.ts (cash o cash_usd según paid_currency)
//   - /api/cobranzas/webhook/stripe/route.ts (stripe)
//   - /api/cobranzas/webhook/paypal/route.ts (paypal)
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
  PAYMENT_METHOD_MAPPING,
} from "@/lib/integrations/odoo";
import { enqueueOdooSync } from "@/lib/dal/odoo-sync-queue";

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

  // 5. Lookup factura draft
  let odooInvoiceId: number | null = null;
  try {
    odooInvoiceId = await findLatestDraftInvoiceForPartner(odooPartnerId);
  } catch (err) {
    console.warn("[OdooSyncTrigger] Lookup invoice fallo:", err);
  }
  if (!odooInvoiceId) {
    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId, odooInvoiceId: null,
      error: `Sin factura draft para partner ${odooPartnerId}`,
    });
    return;
  }

  // 6. Intento sincronico
  try {
    const result = await syncOdooForCollectionItem({
      invoiceId: odooInvoiceId,
      paymentMethod,
      paymentReference: paymentReference || "",
      paymentToken,
      paymentDate,
    });

    if (result.ok) {
      console.log(`[OdooSyncTrigger] ✅ ${collectionItemId} sync OK invoice=${odooInvoiceId} state=${result.invoice_payment_state}`);
      return;
    }

    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId, odooInvoiceId,
      error: result.error || "sync fallo",
    });
    console.warn(`[OdooSyncTrigger] Sync fallo, encolado: ${result.error}`);
  } catch (err) {
    await safeEnqueue({
      collectionItemId, paymentToken, paymentMethod, paymentReference,
      amountUsd, amountVes, paymentDate,
      odooPartnerId, odooInvoiceId,
      error: `exception: ${err instanceof Error ? err.message : String(err)}`,
    });
    console.error(`[OdooSyncTrigger] Sync exception, encolado:`, err);
  }
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
