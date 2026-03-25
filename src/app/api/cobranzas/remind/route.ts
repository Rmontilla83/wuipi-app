// POST /api/cobranzas/remind — Envía recordatorios a clientes pendientes
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import {
  getItemsByCampaign,
  createNotification,
  updateNotification,
  getNotificationsByItem,
} from "@/lib/dal/collection-campaigns";
import { sendCollectionWhatsApp } from "@/lib/notifications/whatsapp";
import { sendCollectionEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wuipi-app.vercel.app";
const MAX_REMINDERS = 3;

export async function POST(request: NextRequest) {
  try {
    const { campaign_id, item_ids } = await request.json();
    if (!campaign_id) return apiError("campaign_id requerido", 400);

    const items = await getItemsByCampaign(campaign_id);
    const pendingItems = items.filter(
      (i) =>
        ["sent", "viewed"].includes(i.status) &&
        (!item_ids || item_ids.includes(i.id))
    );

    const results = { reminded: 0, skipped: 0, errors: [] as string[] };

    for (const item of pendingItems) {
      // Check max reminders
      const notifications = await getNotificationsByItem(item.id);
      const whatsappCount = notifications.filter((n) => n.channel === "whatsapp").length;
      const emailCount = notifications.filter((n) => n.channel === "email").length;

      if (whatsappCount >= MAX_REMINDERS && emailCount >= MAX_REMINDERS) {
        results.skipped++;
        continue;
      }

      const paymentUrl = `${APP_URL}/pagar/${item.payment_token}`;

      // Resend WhatsApp
      if (item.customer_phone && whatsappCount < MAX_REMINDERS) {
        const notif = await createNotification({
          item_id: item.id,
          channel: "whatsapp",
          attempt_number: whatsappCount + 1,
        });
        try {
          await sendCollectionWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            paymentUrl,
            isReminder: true,
          });
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`WA ${item.customer_phone}: ${msg}`);
        }
      }

      // Resend Email
      if (item.customer_email && emailCount < MAX_REMINDERS) {
        const notif = await createNotification({
          item_id: item.id,
          channel: "email",
          attempt_number: emailCount + 1,
        });
        try {
          await sendCollectionEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            invoiceNumber: item.invoice_number || undefined,
            paymentUrl,
            isReminder: true,
          });
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`Email ${item.customer_email}: ${msg}`);
        }
      }

      results.reminded++;
    }

    return apiSuccess(results);
  } catch (error) {
    return apiServerError(error);
  }
}
