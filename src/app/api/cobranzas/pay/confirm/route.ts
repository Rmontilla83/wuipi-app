// POST /api/cobranzas/pay/confirm — Confirma transferencia manual
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionConfirmTransferSchema } from "@/lib/validations/schemas";
import { getItemsByToken, updateItem } from "@/lib/dal/collection-campaigns";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 transfer confirmations per minute per IP
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`confirm:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = validate(collectionConfirmTransferSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { token, reference } = parsed.data;
    const item = await getItemsByToken(token);
    if (!item) return apiError("Enlace de pago no encontrado", 404);
    if (item.status === "paid") return apiError("Este cobro ya fue pagado", 400);
    if (item.status === "conciliating") return apiError("Ya se reportó un pago para este cobro", 400);
    if (!["pending", "sent", "viewed"].includes(item.status)) return apiError("Este cobro no puede recibir pagos", 400);

    // Mark as conciliating — admin will verify via transfer search
    await updateItem(item.id, {
      status: "conciliating",
      payment_method: "transferencia",
      payment_reference: reference,
    });

    // Send payment confirmation notifications
    const amount = `$${Number(item.amount_usd).toFixed(2)} USD`;
    const concept = item.concept || "Servicio WUIPI";

    if (item.customer_phone) {
      sendPaymentConfirmationWhatsApp({
        phone: item.customer_phone,
        customerName: item.customer_name,
        reference,
        amount,
        concept,
      }).catch((err) => console.error("[PayConfirm] WA confirmation error:", err));
    }

    if (item.customer_email) {
      sendPaymentConfirmationEmail({
        email: item.customer_email,
        customerName: item.customer_name,
        reference,
        amount,
        concept,
      }).catch((err) => console.error("[PayConfirm] Email confirmation error:", err));
    }

    return apiSuccess({
      status: "conciliating",
      message: "Transferencia reportada. Será verificada en las próximas horas.",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
