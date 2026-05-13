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
import { syncOdooForCollectionItem } from "@/lib/integrations/odoo";
import {
  getReadyToProcess,
  markQueueItemDone,
  markQueueItemFailed,
  markQueueItemProgress,
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

      // Validar campos minimos
      if (!item.odoo_invoice_id) {
        await markQueueItemFailed(item.id, {
          error: "odoo_invoice_id es null — no se puede sync sin saber a que factura aplicar",
        });
        stats.items_failed++;
        continue;
      }
      if (!item.payment_token) {
        await markQueueItemFailed(item.id, { error: "payment_token requerido" });
        stats.items_failed++;
        continue;
      }

      // Ejecutar el sync (con idempotencia paso a paso)
      try {
        const result = await syncOdooForCollectionItem({
          invoiceId: item.odoo_invoice_id,
          paymentMethod: item.payment_method,
          paymentReference: item.payment_reference || "",
          paymentToken: item.payment_token,
          paymentDate: item.payment_date || undefined,
          postInvoiceDone: item.post_invoice_done,
          registerPaymentDone: item.register_payment_done,
          amountUsd: item.amount_usd ?? null,  // Stripe/PayPal: factura VES + payment USD
        });

        if (result.ok) {
          await markQueueItemDone(item.id);
          stats.items_done++;
          console.log(`[OdooSync Cron] ✅ ${item.id} (invoice ${item.odoo_invoice_id}) done`);
        } else {
          await markQueueItemFailed(item.id, {
            error: result.error || "unknown",
            post_invoice_done: result.post_invoice_done,
            register_payment_done: result.register_payment_done,
          });
          stats.items_failed++;
          console.warn(`[OdooSync Cron] ❌ ${item.id} (invoice ${item.odoo_invoice_id}) failed: ${result.error}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await markQueueItemFailed(item.id, { error: "exception: " + errMsg });
        stats.items_failed++;
        console.error(`[OdooSync Cron] ❌ ${item.id} exception:`, err);
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
