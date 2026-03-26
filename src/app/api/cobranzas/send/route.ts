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

export async function POST(request: NextRequest) {
  try {
    // ── Env var diagnostic ──
    console.log("[send] === ENV CHECK ===");
    console.log("[send] WHATSAPP_PHONE_NUMBER_ID:", process.env.WHATSAPP_PHONE_NUMBER_ID?.substring(0, 6) ?? "UNDEFINED");
    console.log("[send] WHATSAPP_ACCESS_TOKEN:", process.env.WHATSAPP_ACCESS_TOKEN?.substring(0, 10) ?? "UNDEFINED");
    console.log("[send] RESEND_API_KEY:", process.env.RESEND_API_KEY?.substring(0, 10) ?? "UNDEFINED");
    console.log("[send] NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL ?? "UNDEFINED");
    console.log("[send] APP_URL resolved:", APP_URL);

    const { campaign_id } = await request.json();
    if (!campaign_id) return apiError("campaign_id requerido", 400);

    const campaign = await getCampaign(campaign_id);
    if (!campaign) return apiError("Campaña no encontrada", 404);
    if (campaign.status !== "draft" && campaign.status !== "active") {
      return apiError("La campaña no está en estado válido para enviar", 400);
    }

    // Update campaign to sending
    await updateCampaign(campaign_id, { status: "sending" });

    const items = await getItemsByCampaign(campaign_id);
    const sendable = items.filter((i) => i.status === "pending" || i.status === "sent");
    console.log("[send] Total items:", items.length, "| Sendable (pending/sent):", sendable.length);

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    for (const item of items) {
      if (item.status !== "pending" && item.status !== "sent") {
        console.log(`[send] SKIP item ${item.id} — status=${item.status}`);
        continue;
      }

      const paymentUrl = `${APP_URL}/pagar/${item.payment_token}`;
      console.log(`[send] ── Item ${item.id} ──`);
      console.log(`[send]   name=${item.customer_name} phone=${item.customer_phone} email=${item.customer_email}`);
      console.log(`[send]   amount=$${item.amount_usd} status=${item.status} token=${item.payment_token}`);

      // Send WhatsApp — initial send uses "cobranza_pago_pendiente" template
      if (item.customer_phone) {
        console.log(`[send]   WA: sending to ${item.customer_phone}...`);
        const notif = await createNotification({ item_id: item.id, channel: "whatsapp" });
        try {
          await sendCollectionWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            paymentUrl,
            reminderType: "initial",
          });
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
          console.log(`[send]   WA: SUCCESS`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`WhatsApp ${item.customer_phone}: ${msg}`);
          console.error(`[send]   WA: FAILED — ${msg}`);
        }
      } else {
        console.log(`[send]   WA: SKIPPED — no phone`);
      }

      // Send Email
      if (item.customer_email) {
        console.log(`[send]   Email: sending to ${item.customer_email}...`);
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
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
          console.log(`[send]   Email: SUCCESS`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`Email ${item.customer_email}: ${msg}`);
          console.error(`[send]   Email: FAILED — ${msg}`);
        }
      } else {
        console.log(`[send]   Email: SKIPPED — no email`);
      }

      // Mark item as sent
      await updateItem(item.id, { status: "sent" });
      results.sent++;
    }

    // Update campaign to active
    await updateCampaign(campaign_id, { status: "active" });

    console.log("[send] === DONE ===", JSON.stringify(results));

    return apiSuccess({
      campaign_id,
      ...results,
    });
  } catch (error) {
    console.error("[send] UNHANDLED ERROR:", error);
    return apiServerError(error);
  }
}
