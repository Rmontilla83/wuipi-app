// POST /api/cobranzas/send — Dispara WhatsApp + Email para una campaña (con soporte de batches)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import {
  getCampaign,
  getItemsByCampaign,
  updateCampaign,
  updateItem,
  createNotification,
  updateNotification,
} from "@/lib/dal/collection-campaigns";
import { sendCollectionWhatsApp } from "@/lib/notifications/whatsapp";
import { sendCollectionEmail } from "@/lib/notifications/email";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getClientIP } from "@/lib/utils/rate-limit";

// Fire-and-forget audit del envío. Sin esto, una campaña que falla
// (timeout, error de red, batch sin items procesables) se vuelve invisible
// — los items quedan en pending y nadie sabe por qué. Cada llamada al
// endpoint deja una row en portal_invite_logs (reutilizada como tabla
// genérica de debug) con el batch processado, cuántos items sent/failed,
// y el campaign_id para correlacionar.
async function logSendCall(input: {
  request: NextRequest;
  action: string;
  campaignId?: string | null;
  statusCode: number;
  meta?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  try {
    const sb = createAdminSupabase();
    await sb.from("portal_invite_logs").insert({
      method: "POST",
      path: "/api/cobranzas/send",
      token_prefix: input.campaignId?.slice(0, 8) ?? null,
      partner_id: null,
      action: `send:${input.action}`,
      status_code: input.statusCode,
      user_agent: input.request.headers.get("user-agent") || null,
      ip: getClientIP(input.request.headers) || null,
      referer: input.request.headers.get("referer") || null,
      error_message: input.error || null,
      meta: input.meta || null,
    });
  } catch {
    // No bloquear el envío real si el log falla.
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";
const DEFAULT_BATCH_SIZE = 25; // Process 25 items per request to avoid Vercel timeout

interface ItemResult {
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: { status: number | string; ok: boolean; response: unknown; normalizedPhone?: string; template?: string; lang?: string; fallback?: unknown } | null;
  email_result: { status: string; response?: unknown; error?: string } | null;
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "send");
    if (!caller) {
      await logSendCall({ request, action: "no_permission", statusCode: 403 });
      return apiError("No tienes permiso para enviar cobros", 403);
    }

    const { campaign_id, batch_size, offset: batchOffset } = await request.json();
    if (!campaign_id) {
      await logSendCall({ request, action: "missing_campaign_id", statusCode: 400 });
      return apiError("campaign_id requerido", 400);
    }

    const campaign = await getCampaign(campaign_id);
    if (!campaign) {
      await logSendCall({ request, action: "campaign_not_found", statusCode: 404, campaignId: campaign_id });
      return apiError("Campaña no encontrada", 404);
    }
    if (!["draft", "active", "sending"].includes(campaign.status)) {
      await logSendCall({
        request, action: "invalid_status", statusCode: 400, campaignId: campaign_id,
        meta: { campaign_status: campaign.status },
      });
      return apiError("La campaña no está en estado válido para enviar", 400);
    }

    // Mark as sending (only on first batch)
    if (campaign.status === "draft") {
      await updateCampaign(campaign_id, { status: "sending" });
    }

    const allItems = await getItemsByCampaign(campaign_id);
    const sendable = allItems.filter((i) => i.status === "pending" || i.status === "sent");

    // Batch slicing
    const size = Math.min(batch_size || DEFAULT_BATCH_SIZE, 50);
    const start = batchOffset || 0;
    const batch = sendable.slice(start, start + size);

    await logSendCall({
      request, action: "batch_start", statusCode: 200, campaignId: campaign_id,
      meta: {
        total_items: allItems.length,
        sendable: sendable.length,
        batch_offset: start,
        batch_size: batch.length,
        campaign_status_before: campaign.status,
      },
    });

    let sent = 0;
    let failed = 0;
    const itemResults: ItemResult[] = [];

    for (const item of batch) {
      const paymentUrl = `${APP_URL}/pagar/${item.payment_token}`;
      const result: ItemResult = {
        name: item.customer_name,
        phone: item.customer_phone,
        email: item.customer_email,
        whatsapp: null,
        email_result: null,
      };

      // ── WhatsApp ──
      if (item.customer_phone) {
        const notif = await createNotification({ item_id: item.id, channel: "whatsapp" });
        try {
          const waResult = await sendCollectionWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            paymentUrl,
            reminderType: "initial",
          });
          result.whatsapp = {
            status: waResult.status, ok: waResult.ok, response: waResult.response,
            normalizedPhone: waResult.normalizedPhone, template: waResult.template,
            lang: waResult.lang, fallback: waResult.fallback ?? null,
          };
          await updateNotification(notif.id, {
            status: waResult.ok ? "sent" : "failed",
            sent_at: waResult.ok ? new Date().toISOString() : undefined,
            error_message: waResult.ok ? undefined : JSON.stringify(waResult.response).substring(0, 500),
          });
          if (!waResult.ok) failed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          result.whatsapp = { status: "exception", ok: false, response: msg };
          await updateNotification(notif.id, { status: "failed", error_message: msg.substring(0, 500) });
          failed++;
        }
      } else {
        result.whatsapp = { status: "skipped", ok: false, response: "no phone" };
      }

      // ── Email ──
      if (item.customer_email) {
        const notif = await createNotification({ item_id: item.id, channel: "email" });
        try {
          await sendCollectionEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            invoiceNumber: item.invoice_number || undefined,
            paymentUrl,
            reminderType: "initial",
          });
          result.email_result = { status: "sent" };
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          result.email_result = { status: "failed", error: msg };
          await updateNotification(notif.id, { status: "failed", error_message: msg.substring(0, 500) });
        }
      } else {
        result.email_result = { status: "skipped" };
      }

      await updateItem(item.id, { status: "sent" });
      sent++;
      itemResults.push(result);
    }

    const totalSendable = sendable.length;
    const nextOffset = start + batch.length;
    const hasMore = nextOffset < totalSendable;

    // Mark campaign active when all batches done
    if (!hasMore) {
      await updateCampaign(campaign_id, { status: "active" });
    }

    await logSendCall({
      request, action: hasMore ? "batch_complete" : "campaign_complete",
      statusCode: 200, campaignId: campaign_id,
      meta: { sent, failed, batch_size: batch.length, has_more: hasMore, next_offset: hasMore ? nextOffset : null },
    });

    return apiSuccess({
      campaign_id,
      sent,
      failed,
      batch: { offset: start, size: batch.length, total: totalSendable, next_offset: hasMore ? nextOffset : null, has_more: hasMore },
      results: itemResults,
    });
  } catch (error) {
    console.error("[send] UNHANDLED ERROR:", error);
    await logSendCall({
      request, action: "unhandled_error", statusCode: 500,
      error: error instanceof Error ? error.message : String(error),
    });
    return apiServerError(error);
  }
}
