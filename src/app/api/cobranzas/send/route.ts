// POST /api/cobranzas/send — Dispara WhatsApp + Email para una campaña
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

interface ItemResult {
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp: { status: number | string; ok: boolean; response: unknown; normalizedPhone?: string; template?: string; lang?: string; fallback?: unknown } | null;
  email_result: { status: string; response?: unknown; error?: string } | null;
}

export async function POST(request: NextRequest) {
  try {
    const { campaign_id } = await request.json();
    if (!campaign_id) return apiError("campaign_id requerido", 400);

    const campaign = await getCampaign(campaign_id);
    if (!campaign) return apiError("Campaña no encontrada", 404);
    if (campaign.status !== "draft" && campaign.status !== "active") {
      return apiError("La campaña no está en estado válido para enviar", 400);
    }

    await updateCampaign(campaign_id, { status: "sending" });

    const items = await getItemsByCampaign(campaign_id);
    let sent = 0;
    let failed = 0;
    const itemResults: ItemResult[] = [];
    const env = {
      WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID?.substring(0, 6) ?? "MISSING",
      WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN ? `${process.env.WHATSAPP_ACCESS_TOKEN.substring(0, 10)}...` : "MISSING",
      WHATSAPP_TEMPLATE_LANG: process.env.WHATSAPP_TEMPLATE_LANG ?? "default(es)",
      RESEND_API_KEY: process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 10)}...` : "MISSING",
      APP_URL,
    };

    for (const item of items) {
      if (item.status !== "pending" && item.status !== "sent") continue;

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
            status: waResult.status,
            ok: waResult.ok,
            response: waResult.response,
            normalizedPhone: waResult.normalizedPhone,
            template: waResult.template,
            lang: waResult.lang,
            fallback: waResult.fallback ?? null,
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
        result.whatsapp = { status: "skipped", ok: false, response: "no phone number" };
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

    await updateCampaign(campaign_id, { status: "active" });

    return apiSuccess({
      campaign_id,
      sent,
      failed,
      env,
      results: itemResults,
    });
  } catch (error) {
    console.error("[send] UNHANDLED ERROR:", error);
    return apiServerError(error);
  }
}
