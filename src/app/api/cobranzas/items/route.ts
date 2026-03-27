// PATCH /api/cobranzas/items — Edita un item individual
// POST /api/cobranzas/items — Envía WhatsApp + Email a un item individual
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import {
  updateItem,
  createNotification,
  updateNotification,
  getItemsByToken,
} from "@/lib/dal/collection-campaigns";
import { createAdminSupabase } from "@/lib/supabase/server";
import { sendCollectionWhatsApp } from "@/lib/notifications/whatsapp";
import { sendCollectionEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

export async function PATCH(request: NextRequest) {
  try {
    const { id, ...updates } = await request.json();
    if (!id) return apiError("id requerido", 400);

    // Look up current item to check status
    const sb = createAdminSupabase();
    const { data: currentItem } = await sb
      .from("collection_items")
      .select("status")
      .eq("id", id)
      .single();

    if (!currentItem) return apiError("Item no encontrado", 404);

    // amount_usd only editable when item hasn't been sent yet
    const safeFields = ["customer_name", "customer_email", "customer_phone", "concept", "invoice_number"];
    if (currentItem.status === "pending") {
      safeFields.push("amount_usd");
    }

    const allowed: Record<string, unknown> = {};
    for (const field of safeFields) {
      if (field in updates) allowed[field] = updates[field];
    }

    if (Object.keys(allowed).length === 0) {
      return apiError("No hay campos válidos para actualizar", 400);
    }

    const item = await updateItem(id, allowed);
    return apiSuccess({ item });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { id, customer_name, customer_phone, customer_email, amount_usd, concept, invoice_number, payment_token } = await request.json();
    if (!id || !payment_token) return apiError("id y payment_token requeridos", 400);

    const paymentUrl = `${APP_URL}/pagar/${payment_token}`;
    const result: { whatsapp?: string; email?: string } = {};

    // Send WhatsApp
    if (customer_phone) {
      const notif = await createNotification({ item_id: id, channel: "whatsapp" });
      try {
        await sendCollectionWhatsApp({
          phone: customer_phone,
          customerName: customer_name,
          amountUsd: Number(amount_usd),
          concept: concept || "Servicio WUIPI",
          paymentUrl,
          reminderType: "initial",
        });
        await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        result.whatsapp = "sent";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        await updateNotification(notif.id, { status: "failed", error_message: msg });
        result.whatsapp = `failed: ${msg}`;
      }
    }

    // Send Email
    if (customer_email) {
      const notif = await createNotification({ item_id: id, channel: "email" });
      try {
        await sendCollectionEmail({
          email: customer_email,
          customerName: customer_name,
          amountUsd: Number(amount_usd),
          concept: concept || "Servicio WUIPI",
          invoiceNumber: invoice_number || undefined,
          paymentUrl,
          reminderType: "initial",
        });
        await updateNotification(notif.id, { status: "sent", sent_at: new Date().toISOString() });
        result.email = "sent";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error";
        await updateNotification(notif.id, { status: "failed", error_message: msg });
        result.email = `failed: ${msg}`;
      }
    }

    // Mark as sent
    await updateItem(id, { status: "sent" });
    return apiSuccess(result);
  } catch (error) {
    return apiServerError(error);
  }
}
