// POST /api/cobranzas/pay/c2p-confirm
// Paso 2 del flujo C2P: el cliente ingresa el OTP recibido por SMS y se ejecuta el cobro.
// El paso 1 (POST /api/cobranzas/pay con method=c2p) ya solicito la clave a Mercantil.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionC2PConfirmSchema } from "@/lib/validations/schemas";
import { getItemsByToken, markItemPaid, ensureMercantilInvoiceId } from "@/lib/dal/collection-campaigns";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";
import { MercantilSDK } from "@/lib/mercantil";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`c2p-confirm:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiados intentos, espera un minuto" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = validate(collectionC2PConfirmSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { token, cedula, phone, bankCode, otp } = parsed.data;
    const item = await getItemsByToken(token);
    if (!item) return apiError("Enlace de pago no encontrado", 404);
    if (item.status === "paid") return apiError("Este cobro ya fue pagado", 400);

    const bcv = await fetchBCVRate();
    const amountBss = convertUsdToBs(Number(item.amount_usd), bcv.usd_to_bs);

    const sdk = new MercantilSDK();
    const ua = request.headers.get("user-agent") || "WUIPI-Portal";

    const originMobile = process.env.MERCANTIL_C2P_PHONE?.trim();
    if (!originMobile) {
      console.error("[C2P Confirm] MERCANTIL_C2P_PHONE no configurado");
      return apiError("Pago Movil C2P no esta disponible en este momento", 503);
    }

    // Mercantil caps invoiceNumber at 12 chars (Boton Web + C2P, same constraint).
    const mercantilInvoiceId = await ensureMercantilInvoiceId(item.id, item.payment_token);

    let reference: string;
    try {
      const result = await sdk.createC2PPayment(
        {
          amount: amountBss,
          destinationBankId: bankCode,
          destinationId: cedula,
          // originMobile = telefono del COMERCIO (Wuipi) que recibe el cobro
          originMobile,
          // destinationMobile = telefono del CLIENTE que paga
          destinationMobile: phone,
          invoiceNumber: mercantilInvoiceId,
          purchaseKey: otp,
        },
        { ipaddress: ip || "0.0.0.0", browser_agent: ua }
      );

      // Mercantil approves with status "00" or "0000"; anything else is a decline.
      const status = String(result.status || "").trim();
      const approved = status === "00" || status === "0000" || status.toLowerCase() === "approved";
      if (!approved) {
        return apiError(result.message || `Pago rechazado por el banco (codigo ${status || "desconocido"})`, 402);
      }
      reference = result.reference_number || result.bank_transaction_id || `c2p_${Date.now()}`;
    } catch (err: unknown) {
      const e = err as { message?: string; details?: Record<string, unknown> };
      console.error("[C2P Confirm] Mercantil error:", e.message, e.details || {});
      const msg = (e.message || "").toLowerCase();
      const userMsg = msg.includes("invalid") || msg.includes("incorrect") || msg.includes("clave")
        ? "Clave incorrecta o vencida. Solicita una nueva."
        : msg.includes("balance") || msg.includes("fondo") || msg.includes("insufficient")
        ? "Fondos insuficientes en tu cuenta. Verifica e intenta nuevamente."
        : "No se pudo procesar el pago. Verifica los datos o intenta otro metodo.";
      return apiError(userMsg, 502);
    }

    await markItemPaid(token, {
      payment_method: "c2p",
      payment_reference: reference,
      amount_bss: amountBss,
      bcv_rate: bcv.usd_to_bs,
    });

    // Notifications (fire-and-forget) — el pago ya esta confirmado por Mercantil
    const amount = `$${Number(item.amount_usd).toFixed(2)} USD`;
    const concept = item.concept || "Servicio WUIPI";

    if (item.customer_phone) {
      sendPaymentConfirmationWhatsApp({
        phone: item.customer_phone,
        customerName: item.customer_name,
        reference,
        amount,
        concept,
      }).catch((err) => console.error("[C2P Confirm] WA confirmation error:", err));
    }
    if (item.customer_email) {
      sendPaymentConfirmationEmail({
        email: item.customer_email,
        customerName: item.customer_name,
        reference,
        amount,
        concept,
      }).catch((err) => console.error("[C2P Confirm] Email confirmation error:", err));
    }

    return apiSuccess({
      status: "paid",
      reference,
      message: "Pago Movil C2P confirmado.",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
