// GET /api/cron/odoo-sync-queue
//
// Cron que procesa la cola `odoo_sync_queue`. Llamado por Vercel Crons cada
// 10 minutos según `vercel.json`.
//
// Por cada item ready (status pending/retrying con next_attempt_at <= now):
//   1. Lee el collection_item asociado para sacar metadata (odoo_invoice_ids,
//      odoo_invoice_amounts_usd, etc.)
//   2. Determina las facturas a procesar (de metadata.odoo_invoice_ids o del
//      odoo_invoice_id del propio queue item como fallback)
//   3. Por cada factura, llama syncOdooForCollectionItem. El guard idempotente
//      de esa función skipea si ya está paid (NO duplica pagos manuales).
//   4. Si TODAS las facturas OK → markQueueItemDone
//   5. Si alguna falla → markQueueItemFailed (backoff). Tras 5 intentos →
//      status='manual_review'.
//
// Auth: Vercel envía `Authorization: Bearer ${CRON_SECRET}` automáticamente
// cuando el cron viene del scheduler propio. Rechazamos cualquier llamada
// sin ese header.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — el sync puede ser lento si la cola tiene 50+ items

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  getReadyToProcess,
  markQueueItemDone,
  markQueueItemFailed,
  markQueueItemProgress,
  type OdooSyncQueueItem,
} from "@/lib/dal/odoo-sync-queue";
import {
  syncOdooForCollectionItem,
  payInvoiceResidual,
  isMultiCurrencyMethod,
  computeProratedAmounts,
  getPartnerAnticipo,
  PAYMENT_METHOD_MAPPING,
} from "@/lib/integrations/odoo";
import {
  isPayInvoiceMigrationEnabledForPartner,
  isSaldoAnteriorEnabledForPartner,
} from "@/lib/cobranzas/saldo-anterior";
import { payAllInvoicesBs } from "@/lib/cobranzas/pay-invoices-bs";

const BATCH_SIZE = 25; // Procesar máx 25 items por corrida — evita timeouts

interface RunSummary {
  processed: number;
  done: number;
  failed: number;
  alreadySynced: number;
  errors: Array<{ queueId: string; collectionItemId: string; error: string }>;
}

export async function GET(req: NextRequest) {
  // 1. Auth — solo Vercel Cron o llamada manual con bearer
  const authHeader = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Kill switch global. Si ODOO_SYNC_ENABLED=false, el cron no toca nada
  // (mismo guard que el trigger sincrónico, así no procesamos durante un
  // mantenimiento de Odoo).
  if (process.env.ODOO_SYNC_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "ODOO_SYNC_ENABLED=false" });
  }

  const summary: RunSummary = {
    processed: 0,
    done: 0,
    failed: 0,
    alreadySynced: 0,
    errors: [],
  };

  let items: OdooSyncQueueItem[] = [];
  try {
    items = await getReadyToProcess(BATCH_SIZE);
  } catch (err) {
    console.error("[cron/odoo-sync-queue] getReadyToProcess error:", err);
    return NextResponse.json({ error: "getReadyToProcess failed" }, { status: 500 });
  }

  if (items.length === 0) {
    return NextResponse.json({ ...summary, message: "empty queue" });
  }

  const db = createAdminSupabase();

  for (const item of items) {
    summary.processed++;
    try {
      const outcome = await processQueueItem(db, item);
      if (outcome === "done") summary.done++;
      else if (outcome === "already_synced") summary.alreadySynced++;
      else summary.failed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/odoo-sync-queue] item ${item.id} throwed:`, msg);
      summary.failed++;
      summary.errors.push({ queueId: item.id, collectionItemId: item.collection_item_id, error: msg });
      try {
        await markQueueItemFailed(item.id, { error: `cron exception: ${msg}` });
      } catch (e2) {
        console.error(`[cron/odoo-sync-queue] failed to mark failed:`, e2);
      }
    }
  }

  return NextResponse.json(summary);
}

type ProcessOutcome = "done" | "already_synced" | "failed";

/**
 * Procesa un único item de la cola. Lee el collection_item para sacar las N
 * facturas de metadata (o cae al odoo_invoice_id del queue item como single),
 * llama syncOdooForCollectionItem por cada una, y marca el outcome final.
 */
async function processQueueItem(
  db: ReturnType<typeof createAdminSupabase>,
  item: OdooSyncQueueItem,
): Promise<ProcessOutcome> {
  // Cargar collection_item para metadata (multi-invoice, prorrateo)
  const { data: ci, error: ciErr } = await db
    .from("collection_items")
    .select("metadata, amount_usd, payment_token, payment_method, payment_reference, paid_at")
    .eq("id", item.collection_item_id)
    .maybeSingle();

  if (ciErr || !ci) {
    await markQueueItemFailed(item.id, {
      error: `collection_item ${item.collection_item_id} no encontrado: ${ciErr?.message || "missing"}`,
    });
    return "failed";
  }

  // Extraer invoice IDs y prorrateo de metadata
  const metadata = (ci.metadata || {}) as Record<string, unknown>;
  const idsFromMeta = Array.isArray(metadata.odoo_invoice_ids)
    ? (metadata.odoo_invoice_ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  // Fallback: el odoo_invoice_id del propio queue item si meta no tiene
  const invoiceIds = idsFromMeta.length > 0
    ? idsFromMeta
    : (item.odoo_invoice_id ? [item.odoo_invoice_id] : []);

  if (invoiceIds.length === 0) {
    await markQueueItemFailed(item.id, {
      error: "Sin invoice IDs para procesar (metadata.odoo_invoice_ids vacío y queue.odoo_invoice_id null)",
    });
    return "failed";
  }

  // Vars de cobro (necesarias para gatear los residuales antes de M2).
  const paymentMethod = item.payment_method;
  const amountUsd = Number(item.amount_usd) || Number(ci.amount_usd) || 0;
  const isMultiCur = isMultiCurrencyMethod(paymentMethod);
  const paymentDate = item.payment_date || ci.paid_at?.slice(0, 10) || undefined;

  // Partner efectivo: preferir el del metadata (autoritativo, fijado en `iniciar`
  // desde el token del cliente) sobre el guardado en la cola. El de la cola pudo
  // resolverse por email/cédula → partner EQUIVOCADO si dos comparten email
  // (duplicados/familia). Ver la nota del trigger.
  const metaPidRaw = Number((metadata as Record<string, unknown>).odoo_partner_id);
  const effectivePartnerId = (Number.isInteger(metaPidRaw) && metaPidRaw > 0)
    ? metaPidRaw
    : item.odoo_partner_id;

  const failures: Array<{ invoiceId: number; error: string }> = [];
  let allAlreadySynced = true;
  let postDoneAggregate = item.post_invoice_done;
  let regDoneAggregate = item.register_payment_done;

  // ── MIGRACIÓN a wuipi_pay_invoice (flag WUIPI_PAY_INVOICE_ENABLED) ────────────
  // Mismo flujo unificado que el trigger, para reintentos. Solo Bs. Idempotente
  // por memo → reintentar sobre facturas ya pagadas devuelve already_paid.
  // "solo Bs" = factura VED (171); excluye cash_usd (misma-moneda USD) del helper.
  const isBsInvoiceMethod = !isMultiCur
    && PAYMENT_METHOD_MAPPING[paymentMethod]?.invoiceCurrencyId === 171;
  if (isBsInvoiceMethod && effectivePartnerId && isPayInvoiceMigrationEnabledForPartner(effectivePartnerId)) {
    const journalId = PAYMENT_METHOD_MAPPING[paymentMethod]?.journalId;
    const token = item.payment_token || ci.payment_token;
    const residualIdsMeta = Array.isArray(metadata.odoo_posted_residual_ids)
      ? (metadata.odoo_posted_residual_ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    // Gate del SALDO ANTERIOR: MISMO helper whitelist-aware que el lado que COBRA.
    // Mirar solo el env aquí infla el banco si se reintroduce la whitelist (cobraríamos
    // un residual que al cliente no se le cobró) — review adversarial 2026-07-14.
    const saldoOn = isSaldoAnteriorEnabledForPartner(effectivePartnerId);
    if (residualIdsMeta.length > 0 && !saldoOn) {
      // Ya se le cobró el saldo anterior al cliente: no lo dejes caer en silencio
      // marcando el item como done (sub-cobro invisible). Falla visible en la cola.
      await markQueueItemFailed(item.id, {
        error: `Item cobrado con saldo anterior (inv ${residualIdsMeta.join(",")}) pero el gate está OFF para el partner ${effectivePartnerId} — NO se marca synced (revisar flag/whitelist)`,
      });
      return "failed";
    }
    const res = await payAllInvoicesBs({
      paymentToken: token,
      journalId,
      draftIdsFromMeta: invoiceIds,
      residualIdsFromMeta: saldoOn ? residualIdsMeta : [],
      chargedBs: Number(item.amount_ves) || null,
      logPrefix: `[cron/odoo-sync-queue] ${item.collection_item_id}`,
    });
    if (!res.ok) {
      await markQueueItemFailed(item.id, {
        error: `wuipi_pay_invoice: ${res.failures.length}/${res.attempted} fallaron: ${res.failures.map((f) => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1400)}`,
      });
      return "failed";
    }
    await markQueueItemDone(item.id);
    try {
      await db.from("collection_items")
        .update({ odoo_sync_synced_at: new Date().toISOString() })
        .eq("id", item.collection_item_id).is("odoo_sync_synced_at", null);
    } catch (e) {
      console.warn(`[cron] failed to mark synced_at for ${item.collection_item_id}:`, e);
    }
    return "done";
  }

  // ── Fase 1 — SALDO ANTERIOR: residuales posteados PRIMERO (antes de M2/drafts) ──
  // Se cobran con wuipi_pay_invoice_residual (helper Odoo): crea+postea+reconcilia
  // ATÓMICO contra la factura, sin pasar por el matching de drafts del hook (que
  // enrutaría a anticipo). Idempotente por memo wpy_ → el reintento no duplica.
  let residualTotalBs = 0;
  if (process.env.PORTAL_SALDO_ANTERIOR_ENABLED === "true" && !isMultiCur) {
    residualTotalBs = Math.round((Number(metadata.posted_residual_total_bs) || 0) * 100) / 100;
    const residualIds = Array.isArray(metadata.odoo_posted_residual_ids)
      ? (metadata.odoo_posted_residual_ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const residualJournalId = PAYMENT_METHOD_MAPPING[paymentMethod]?.journalId;
    for (const invoiceId of residualIds) {
      try {
        const r = await payInvoiceResidual(invoiceId, {
          memo: `${item.payment_token || ci.payment_token}#${invoiceId}`,
          journalId: residualJournalId,
        });
        if (!(r.success && r.residual_after_bs <= 0.01)) {
          allAlreadySynced = false;
          failures.push({ invoiceId, error: `residual no cerró: residual_after=${r.residual_after_bs}` });
        }
      } catch (err) {
        allAlreadySynced = false;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ invoiceId, error: `residual exception: ${msg}` });
      }
    }
  }

  // #3 (review) — si algún RESIDUAL falló, no seguir a los drafts (preserva V1).
  if (failures.length > 0) {
    await markQueueItemFailed(item.id, {
      error: `Saldo anterior — residual(es) fallaron antes de drafts: ${failures.map((f) => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1200)}`,
    });
    return "failed";
  }

  // M2 — Multi-DRAFT + saldo a favor: reparto de anticipo no automatizado →
  // revisión manual (los residuales ya se procesaron arriba). Incidente 2026-06-30.
  if (invoiceIds.length > 1 && effectivePartnerId) {
    try {
      const a = await getPartnerAnticipo(effectivePartnerId);
      if (a.has_anticipo && a.bs > 0.01) {
        await markQueueItemFailed(item.id, {
          error: `Multi-draft (${invoiceIds.length}) con saldo a favor (Bs ${a.bs}) — revisión manual: reparto de anticipo no automatizado (no inflar banco).${failures.length ? ` (residual(es) ${failures.map(f => f.invoiceId).join(",")} fallaron — reintenta)` : ``}`,
        });
        return "failed";
      }
    } catch (err) {
      console.warn("[cron odoo-sync] M2 check anticipo multi-factura fallo:", err);
    }
  }

  const amountsMap = (() => {
    if (!metadata.odoo_invoice_amounts_usd || typeof metadata.odoo_invoice_amounts_usd !== "object") return null;
    const raw = metadata.odoo_invoice_amounts_usd as Record<string, unknown>;
    const parsed: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      const amt = Number(v);
      if (Number.isInteger(id) && id > 0 && Number.isFinite(amt) && amt > 0) {
        parsed[id] = amt;
      }
    }
    return Object.keys(parsed).length > 0 ? parsed : null;
  })();

  // Prorrateo multi-moneda (Stripe/PayPal).
  let proratedByInvoice: Record<number, number> = {};
  if (isMultiCur && amountUsd > 0) {
    proratedByInvoice = computeProratedAmounts(invoiceIds, amountsMap, amountUsd);
  }

  // B1 — NO INFLAR BANCO. item.amount_ves (= amount_bss congelado) INCLUYE el
  // residual. El draft se cobra neto (amount_ves − residual); el residual ya se
  // registró arriba por su amount_residual. Flag off → residualTotalBs=0 → idéntico.
  let draftVesPaid: number | null = null;
  if (invoiceIds.length === 1) {
    if (residualTotalBs > 0) {
      const net = Math.round(((Number(item.amount_ves) || 0) - residualTotalBs) * 100) / 100;
      draftVesPaid = net > 0.01 ? net : null;
    } else {
      draftVesPaid = Number(item.amount_ves) || null;
    }
  }

  // Procesar cada draft (failures/allAlreadySynced/flags ya declarados arriba).
  for (const invoiceId of invoiceIds) {
    const amountUsdForInvoice = isMultiCur ? proratedByInvoice[invoiceId] : undefined;
    try {
      const result = await syncOdooForCollectionItem({
        invoiceId,
        paymentMethod,
        paymentReference: item.payment_reference || ci.payment_reference || "",
        paymentToken: item.payment_token || ci.payment_token,
        paymentDate,
        // Pasamos los flags de idempotencia parcial del propio queue item —
        // si un intento previo posteo una de las facturas pero falló en la
        // siguiente, no re-postear las que ya están OK.
        postInvoiceDone: invoiceIds.length === 1 ? postDoneAggregate : false,
        registerPaymentDone: invoiceIds.length === 1 ? regDoneAggregate : false,
        amountUsd: amountUsdForInvoice,
        // Monto real cobrado en Bs (flujo de anticipo), YA neto del residual (B1).
        amountVesPaid: draftVesPaid,
      });

      if (result.ok) {
        if (!result.already_synced) allAlreadySynced = false;
        // Solo agregamos los flags del único invoice cuando el queue item
        // representa 1 sola factura — con multi-factura los flags ya no
        // tienen una correspondencia uno-a-uno.
        if (invoiceIds.length === 1) {
          postDoneAggregate = true;
          regDoneAggregate = true;
        }
      } else {
        allAlreadySynced = false;
        failures.push({ invoiceId, error: result.error || "sync fallo sin error" });
        // Persistir progreso parcial si alguna sub-etapa terminó OK
        if (invoiceIds.length === 1 && (result.post_invoice_done || result.register_payment_done)) {
          await markQueueItemProgress(item.id, {
            post_invoice_done: result.post_invoice_done,
            register_payment_done: result.register_payment_done,
          });
        }
      }
    } catch (err) {
      allAlreadySynced = false;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ invoiceId, error: `exception: ${msg}` });
    }
  }

  // (Los residuales del saldo anterior ya se procesaron ARRIBA, antes de M2 y
  // de los drafts.)

  if (failures.length === 0) {
    await markQueueItemDone(item.id);
    // Marcar el collection_item como sincronizado para que el panel
    // /cobranzas no lo cuente como huérfano (mismo flag que el trigger
    // sincrónico — ver migración 021).
    try {
      await db
        .from("collection_items")
        .update({ odoo_sync_synced_at: new Date().toISOString() })
        .eq("id", item.collection_item_id)
        .is("odoo_sync_synced_at", null);
    } catch (e) {
      console.warn(`[cron] failed to mark synced_at for ${item.collection_item_id}:`, e);
    }
    return allAlreadySynced ? "already_synced" : "done";
  }

  await markQueueItemFailed(item.id, {
    error: `${failures.length}/${invoiceIds.length} fallaron: ${failures.map((f) => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1500)}`,
  });
  return "failed";
}
