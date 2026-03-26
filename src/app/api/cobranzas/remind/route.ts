// POST /api/cobranzas/remind — Envía recordatorios según lógica de corte día 8
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";
const MAX_REMINDERS = 3;
const CUTOFF_DAY = 8; // Día de corte WUIPI

/**
 * Determina el tipo de recordatorio según la fecha actual y el historial.
 * - 1er recordatorio: 3 días después del envío inicial → "48h"
 * - 2do recordatorio: día 5 del mes (si aún no pagó) → "48h"
 * - 3er recordatorio: día 7 del mes (urgente, último aviso) → "urgent"
 */
function getReminderType(attemptNumber: number, today: Date): {
  type: "48h" | "urgent";
  shouldSend: boolean;
} {
  const dayOfMonth = today.getDate();

  if (attemptNumber >= MAX_REMINDERS) {
    return { type: "urgent", shouldSend: false };
  }

  // 3er recordatorio: día 7 (urgente)
  if (attemptNumber === 2 && dayOfMonth >= CUTOFF_DAY - 1) {
    return { type: "urgent", shouldSend: true };
  }

  // 2do recordatorio: día 5
  if (attemptNumber === 1 && dayOfMonth >= CUTOFF_DAY - 3) {
    return { type: "48h", shouldSend: true };
  }

  // 1er recordatorio: siempre que hayan pasado 3+ días desde el envío
  if (attemptNumber === 0) {
    return { type: "48h", shouldSend: true };
  }

  return { type: "48h", shouldSend: false };
}

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
    const today = new Date();

    for (const item of pendingItems) {
      const notifications = await getNotificationsByItem(item.id);

      // Count reminders only (attempt_number > 1 means reminder, 1 = initial send)
      const whatsappReminders = notifications.filter(
        (n) => n.channel === "whatsapp" && n.attempt_number > 1
      ).length;
      const emailReminders = notifications.filter(
        (n) => n.channel === "email" && n.attempt_number > 1
      ).length;

      // Check if first send was at least 3 days ago
      const firstSend = notifications
        .filter((n) => n.attempt_number === 1 && n.status === "sent")
        .sort((a, b) => (a.sent_at || "").localeCompare(b.sent_at || ""))[0];

      if (firstSend?.sent_at) {
        const daysSinceFirstSend = Math.floor(
          (today.getTime() - new Date(firstSend.sent_at).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceFirstSend < 3 && whatsappReminders === 0) {
          results.skipped++;
          continue;
        }
      }

      const waReminder = getReminderType(whatsappReminders, today);
      const emailReminder = getReminderType(emailReminders, today);

      if (!waReminder.shouldSend && !emailReminder.shouldSend) {
        results.skipped++;
        continue;
      }

      const paymentUrl = `${APP_URL}/pagar/${item.payment_token}`;

      // Send WhatsApp reminder
      if (item.customer_phone && waReminder.shouldSend) {
        const notif = await createNotification({
          item_id: item.id,
          channel: "whatsapp",
          attempt_number: whatsappReminders + 2, // +2 because 1 = initial, 2+ = reminders
        });
        try {
          await sendCollectionWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            paymentUrl,
            reminderType: waReminder.type,
          });
          await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error";
          await updateNotification(notif.id, { status: "failed", error_message: msg });
          results.errors.push(`WA ${item.customer_phone}: ${msg}`);
        }
      }

      // Send Email reminder
      if (item.customer_email && emailReminder.shouldSend) {
        const notif = await createNotification({
          item_id: item.id,
          channel: "email",
          attempt_number: emailReminders + 2,
        });
        try {
          await sendCollectionEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
            concept: item.concept || "Servicio WUIPI",
            invoiceNumber: item.invoice_number || undefined,
            paymentUrl,
            reminderType: emailReminder.type,
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
