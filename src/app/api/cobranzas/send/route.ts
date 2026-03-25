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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wuipi-app.vercel.app";

export async function POST(request: NextRequest) {
  try {
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
    const results = { sent: 0, failed: 0, errors: [] as string[] };

    for (const item of items) {
      if (item.status !== "pending" && item.status !== "sent") continue;

      const paymentUrl = `${APP_URL}/pagar/${item.payment_token}`;

      // Send WhatsApp
      if (item.customer_phone) {
        const notif = await createNotification({ item_id: item.id, channel: "whatsapp" });
        try {
          await sendCollectionWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            paymentUrl,
          });
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`WhatsApp ${item.customer_phone}: ${msg}`);
        }
      }

      // Send Email
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
          });
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`Email ${item.customer_email}: ${msg}`);
        }
      }

      // Mark item as sent
      await updateItem(item.id, { status: "sent" });
      results.sent++;
    }

    // Update campaign to active
    await updateCampaign(campaign_id, { status: "active" });

    return apiSuccess({
      campaign_id,
      ...results,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
