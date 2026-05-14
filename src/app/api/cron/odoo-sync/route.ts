// GET /api/cron/odoo-sync
//
// Cron que procesa la cola odoo_sync_queue cada 10 minutos. Por cada item
// "pending"/"retrying" cuyo next_attempt_at <= NOW(), intenta el sync con
// idempotencia (si ya hizo post_invoice, salta ese paso). Tras error
// incrementa attempts y reagenda con backoff exponencial. Tras 5 intentos
// queda en manual_review y dispara alerta Telegram al canal Finanzas.
//
// Defensas:
//  - Bearer token CRON_SECRET (requireCronAuth)
//  - ODOO_SYNC_ENABLED=true (sino el cron solo loggea, no toca Odoo)
//  - Whitelist de partners (si esta configurada)
//  - Limite de procesamiento por run (50 items max)

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  syncOdooForCollectionItem,
  isMultiCurrencyMethod,
  computeProratedAmounts,
} from "@/lib/integrations/odoo";
import { extractInvoiceSyncFields } from "@/lib/integrations/odoo-sync-trigger";
import {
  getReadyToProcess,
  markQueueItemDone,
  markQueueItemFailed,
  getUnnotifiedManualReviewItems,
  markQueueItemNotified,
  type OdooSyncQueueItem,
} from "@/lib/dal/odoo-sync-queue";
import { isConfigured as telegramConfigured, sendMessage, getChannels } from "@/lib/integrations/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;  // hasta 5 min para procesar batch

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

export async function GET(request: NextRequest) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const enabled = process.env.ODOO_SYNC_ENABLED === "true";
  const whitelist = (process.env.ODOO_SYNC_PARTNER_WHITELIST || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(Number);
  const whitelistActive = whitelist.length > 0;

  const supabase = createAdminSupabase();
  const stats = {
    enabled,
    whitelist_active: whitelistActive,
    items_processed: 0,
    items_done: 0,
    items_failed: 0,
    items_skipped_whitelist: 0,
    notifications_sent: 0,
    errors: [] as string[],
  };

  if (!enabled) {
    console.log("[OdooSync Cron] ODOO_SYNC_ENABLED=false — skipping processing");
    // Aun sin enabled, intentamos enviar notificaciones pendientes
  } else {
    // ---- 1. Procesar cola ----
    let items: OdooSyncQueueItem[] = [];
    try {
      items = await getReadyToProcess(50);
    } catch (err) {
      stats.errors.push("getReadyToProcess: " + (err instanceof Error ? err.message : String(err)));
      return NextResponse.json({ ok: false, ...stats }, { status: 500 });
    }

    console.log(`[OdooSync Cron] ${items.length} items listos para procesar`);

    for (const item of items) {
      stats.items_processed++;

      // Whitelist check
      if (whitelistActive && item.odoo_partner_id && !whitelist.includes(item.odoo_partner_id)) {
        stats.items_skipped_whitelist++;
        continue;
      }

      if (!item.payment_token) {
        await markQueueItemFailed(item.id, { error: "payment_token requerido" });
        stats.items_failed++;
        continue;
      }

      // Resolver el universo de facturas a procesar para este item:
      // 1) Leer collection_items.metadata para extraer odoo_invoice_ids + amounts
      //    (formato nuevo desde 2026-05-14 que cubre multi-factura).
      // 2) Si no hay metadata válida → fallback al item.odoo_invoice_id legacy
      //    (UNA factura). Mantiene compat con filas viejas en cola.
      let invoiceIds: number[] = [];
      let invoiceAmountsUsd: Record<number, number> | null = null;
      try {
        const { data: ci } = await supabase
          .from("collection_items")
          .select("metadata")
          .eq("id", item.collection_item_id)
          .single();
        const fields = extractInvoiceSyncFields(ci?.metadata);
        if (fields.odooInvoiceIds && fields.odooInvoiceIds.length > 0) {
          invoiceIds = fields.odooInvoiceIds;
          invoiceAmountsUsd = fields.invoiceAmountsUsd;
        }
      } catch (err) {
        console.warn(`[OdooSync Cron] Failed reading collection_items ${item.collection_item_id}:`, err);
      }
      if (invoiceIds.length === 0) {
        // Fallback legacy: una sola factura desde la fila de la cola
        if (item.odoo_invoice_id) {
          invoiceIds = [item.odoo_invoice_id];
        } else {
          await markQueueItemFailed(item.id, {
            error: "Sin invoiceIds — ni metadata.odoo_invoice_ids ni queue.odoo_invoice_id",
          });
          stats.items_failed++;
          continue;
        }
      }
      if (invoiceIds.length > 1 && !invoiceAmountsUsd && isMultiCurrencyMethod(item.payment_method)) {
        console.warn(
          `[OdooSync Cron] Item ${item.collection_item_id} multi-moneda con ${invoiceIds.length} facturas ` +
          `SIN invoiceAmountsUsd → split equitativo. Considerá inspeccionar el item legacy.`
        );
      }

      // Calcular prorrateo (si aplica) — mismo criterio que el trigger.
      const isMultiCur = isMultiCurrencyMethod(item.payment_method);
      const totalAmountUsd = item.amount_usd ?? null;
      const prorated: Record<number, number> = (isMultiCur && typeof totalAmountUsd === "number" && totalAmountUsd > 0)
        ? computeProratedAmounts(invoiceIds, invoiceAmountsUsd, totalAmountUsd)
        : {};

      // Procesar TODAS las facturas. La idempotencia por factura está en
      // syncOdooForCollectionItem (pre-check del state). Si ya está posted+paid,
      // retorna already_synced=true sin tocar nada.
      // Para los flags post_invoice_done/register_payment_done de la cola
      // NO los pasamos en multi-factura (eran un atajo cuando había 1 sola).
      // El pre-check del sync los infiere desde el state real de cada factura.
      const passQueueFlags = invoiceIds.length === 1;
      const failures: Array<{ invoiceId: number; error: string }> = [];
      let allOk = true;

      for (const invoiceId of invoiceIds) {
        try {
          const amountUsdForInvoice = isMultiCur ? prorated[invoiceId] : undefined;
          const result = await syncOdooForCollectionItem({
            invoiceId,
            paymentMethod: item.payment_method,
            paymentReference: item.payment_reference || "",
            paymentToken: item.payment_token,
            paymentDate: item.payment_date || undefined,
            postInvoiceDone: passQueueFlags ? item.post_invoice_done : undefined,
            registerPaymentDone: passQueueFlags ? item.register_payment_done : undefined,
            amountUsd: amountUsdForInvoice,
          });
          if (result.ok) {
            console.log(`[OdooSync Cron] ✅ item=${item.id} invoice=${invoiceId} sync OK${result.already_synced ? " (already_synced)" : ""}`);
          } else {
            allOk = false;
            failures.push({ invoiceId, error: result.error || "unknown" });
            console.warn(`[OdooSync Cron] ❌ item=${item.id} invoice=${invoiceId} failed: ${result.error}`);
          }
        } catch (err) {
          allOk = false;
          const errMsg = err instanceof Error ? err.message : String(err);
          failures.push({ invoiceId, error: `exception: ${errMsg}` });
          console.error(`[OdooSync Cron] ❌ item=${item.id} invoice=${invoiceId} exception:`, err);
        }
      }

      if (allOk) {
        await markQueueItemDone(item.id);
        stats.items_done++;
      } else {
        await markQueueItemFailed(item.id, {
          error: `${failures.length}/${invoiceIds.length} fallaron: ${failures.map(f => `inv${f.invoiceId}=${f.error}`).join("; ").slice(0, 1500)}`,
        });
        stats.items_failed++;
      }
    }
  }

  // ---- 2. Notificar manual_review pendientes (independiente de enabled) ----
  if (telegramConfigured()) {
    try {
      const unnotified = await getUnnotifiedManualReviewItems();
      if (unnotified.length > 0) {
        const channels = getChannels();
        const targetChannel = channels.finanzas || channels.socios;
        if (targetChannel) {
          for (const item of unnotified) {
            const customer = await getCustomerName(supabase, item.collection_item_id);
            const msg = formatTelegramAlert(item, customer);
            const sent = await sendMessage(targetChannel, msg);
            if (sent) {
              await markQueueItemNotified(item.id);
              stats.notifications_sent++;
            }
          }
        }
      }
    } catch (err) {
      stats.errors.push("notifications: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}

async function getCustomerName(supabase: any, collectionItemId: string): Promise<string> {
  const { data } = await supabase
    .from("collection_items")
    .select("customer_name")
    .eq("id", collectionItemId)
    .single();
  return data?.customer_name || "(desconocido)";
}

function formatTelegramAlert(item: OdooSyncQueueItem, customerName: string): string {
  const adminUrl = `${APP_URL}/cobranzas/odoo-pendientes`;
  return [
    "<b>⚠️ Sync Odoo falló — review manual</b>",
    "",
    `<b>Cliente:</b> ${escapeHtml(customerName)}`,
    `<b>Token:</b> ${escapeHtml(item.payment_token)}`,
    `<b>Factura Odoo:</b> ${item.odoo_invoice_id || "(no determinada)"}`,
    `<b>Monto:</b> ${item.amount_ves ? `${item.amount_ves} Bs` : item.amount_usd ? `$${item.amount_usd}` : "?"}`,
    `<b>Método:</b> ${escapeHtml(item.payment_method)}`,
    `<b>Intentos:</b> ${item.attempts}`,
    `<b>Último error:</b> <i>${escapeHtml((item.last_error || "").slice(0, 300))}</i>`,
    "",
    `<a href="${adminUrl}">Abrir cola en admin</a>`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
