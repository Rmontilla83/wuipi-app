// POST /api/cobranzas/pay — Inicia pago (genera URL Mercantil o Stripe session)
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionPaySchema } from "@/lib/validations/schemas";
import { getItemsByToken, updateItem, ensureMercantilInvoiceId } from "@/lib/dal/collection-campaigns";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";
import { postedResidualBs } from "@/lib/cobranzas/saldo-anterior";
import { MercantilSDK } from "@/lib/mercantil";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import Stripe from "stripe";
import { isPayPalConfigured, createPayPalOrder } from "@/lib/integrations/paypal";
import { logGatewayEvent, classifyError } from "@/lib/dal/payment-gateway-logs";

const FALLBACK_URL = "https://api.wuipi.net";

function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw && raw.startsWith("https://")) return raw;
  if (raw && raw.startsWith("http://localhost")) return raw;
  return FALLBACK_URL;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`pay:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes, intenta en un minuto" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = validate(collectionPaySchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { token, method } = parsed.data;
    const item = await getItemsByToken(token);
    if (!item) return apiError("Enlace de pago no encontrado", 404);
    if (item.status === "paid") return apiError("Este cobro ya fue pagado", 400);
    if (item.expires_at && new Date(item.expires_at) < new Date()) {
      return apiError("Este enlace de pago ha expirado", 410);
    }

    // Mapeo del method del request → gateway+product para el log
    const gatewayMap: Record<string, { gateway: "mercantil" | "c2p" | "stripe" | "paypal" | "transferencia"; product: string }> = {
      debito_inmediato: { gateway: "mercantil", product: "web_button" },
      c2p:              { gateway: "c2p",       product: "c2p_otp_request" },
      stripe:           { gateway: "stripe",    product: "checkout_session" },
      paypal:           { gateway: "paypal",    product: "order_create" },
      transferencia:    { gateway: "transferencia", product: "info_show" },
    };
    const gw = gatewayMap[method];

    // Log: cliente inicio el flujo de pago
    if (gw) {
      logGatewayEvent({
        collectionItemId: item.id,
        paymentToken: item.payment_token,
        gateway: gw.gateway,
        gatewayProduct: gw.product,
        eventType: "initiated",
        ip,
        userAgent: request.headers.get("user-agent"),
        customerCedulaRif: item.customer_cedula_rif,
        customerName: item.customer_name,
        amountUsd: Number(item.amount_usd),
      }).catch(() => {/* swallow — log es best-effort */});
    }

    const bcv = await fetchBCVRate();
    // Fase 1: sumar el saldo anterior (Bs fijo) al monto convertido → el cliente
    // paga drafts + residual en un solo cobro. Flag off → postedResidualBs = 0.
    const amountBss = convertUsdToBs(Number(item.amount_usd), bcv.usd_to_bs)
      + postedResidualBs(item.metadata);

    // Save BCV rate on the item for future reference
    await updateItem(item.id, {
      bcv_rate: bcv.usd_to_bs,
      amount_bss: amountBss,
    } as Record<string, unknown>);

    // ---- Débito Inmediato (Mercantil Web Button) ----
    if (method === "debito_inmediato") {
      // Mercantil caps invoiceNumber.number at 12 chars (root cause of error 821).
      // Persist the short ID so the webhook can map back to the payment_token.
      // Run OUTSIDE the SDK try so DB errors get distinct logging.
      let mercantilInvoiceId: string;
      try {
        mercantilInvoiceId = await ensureMercantilInvoiceId(item.id, item.payment_token);
      } catch (err: unknown) {
        const e = err as { message?: string; code?: string; details?: unknown };
        console.error("[Pay] ensureMercantilInvoiceId failed:", {
          message: e.message,
          code: e.code,
          details: e.details,
          itemId: item.id,
        });
        const isMissingColumn =
          e.code === "42703" || (e.message || "").toLowerCase().includes("mercantil_invoice_id");
        return apiError(
          isMissingColumn
            ? "La migracion 014 (mercantil_invoice_id) no esta aplicada en Supabase. Aplicala y reintenta."
            : `Error preparando ID de factura: ${e.message || "desconocido"}`,
          500
        );
      }

      const t0 = Date.now();
      try {
        const sdk = new MercantilSDK();
        const today = new Date().toISOString().split("T")[0];
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const sdkPayload = {
          amount: amountBss,
          customerName: item.customer_name,
          returnUrl: `${getAppUrl()}/pagar/${token}?status=callback`,
          currency: "ves" as const,
          invoiceNumber: {
            number: mercantilInvoiceId,
            invoiceCreationDate: today,
            invoiceCancelledDate: dueDate,
          },
          paymentConcepts: ["b2b", "c2p", "tdd"] as ("b2b" | "c2p" | "tdd")[],
        };
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "mercantil", gatewayProduct: "web_button",
          eventType: "request_sent",
          request: { ...sdkPayload, invoiceNumber: sdkPayload.invoiceNumber.number },
          amountVes: amountBss,
        }).catch(() => {});

        const result = sdk.createPayment(sdkPayload);

        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "mercantil", gatewayProduct: "web_button",
          eventType: "response_received", outcome: "pending",
          response: { redirectUrl: result.redirectUrl ? "[present]" : "[missing]" },
          durationMs: Date.now() - t0,
        }).catch(() => {});

        return apiSuccess({
          method: "debito_inmediato",
          redirect_url: result.redirectUrl,
          amount_bss: amountBss,
          bcv_rate: bcv.usd_to_bs,
          mercantil_invoice_id: mercantilInvoiceId,
        });
      } catch (err: unknown) {
        const e = err as { message?: string; details?: unknown };
        console.error("[Pay] Mercantil SDK error:", {
          message: e.message,
          details: e.details,
          itemId: item.id,
          mercantilInvoiceId,
        });
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "mercantil", gatewayProduct: "web_button",
          eventType: "error", outcome: "error",
          responseMessage: e.message || "unknown",
          errorCategory: classifyError("mercantil", null, e.message),
          durationMs: Date.now() - t0,
        }).catch(() => {});
        return apiError(
          `Error al generar enlace de Mercantil: ${e.message || "desconocido"}. Intente con otro metodo.`,
          500
        );
      }
    }

    // ---- Stripe (USD) ----
    if (method === "stripe") {
      const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
      if (!stripeKey || stripeKey.length < 10) {
        return apiError("Pago con tarjeta no disponible en este momento", 503);
      }

      // Stripe Checkout exige minimo $0.50 USD por sesion. Validar antes de
      // llamar al SDK evita un error feo en ingles y ahorra la llamada.
      if (Number(item.amount_usd) < 0.5) {
        return apiError(
          "El monto mínimo para pagar con tarjeta es $0.50 USD. Usa otro método de pago.",
          400
        );
      }

      const t0 = Date.now();
      try {
        const amountCents = Math.round(Number(item.amount_usd) * 100);
        const successUrl = `${getAppUrl()}/pagar/${token}?status=success`;
        const cancelUrl = `${getAppUrl()}/pagar/${token}?status=cancelled`;

        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "stripe", gatewayProduct: "checkout_session",
          eventType: "request_sent",
          request: { amount: Number(item.amount_usd), currency: "usd", invoice_id: item.invoice_number, mode: "payment" },
        }).catch(() => {});

        const stripe = new Stripe(stripeKey, { apiVersion: "2025-04-30.basil" as Stripe.LatestApiVersion });
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: item.concept || "Servicio WUIPI",
                  ...(item.invoice_number ? { description: `Factura: ${item.invoice_number}` } : {}),
                },
                unit_amount: amountCents,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            collection_token: token,
            item_id: item.id,
            campaign_id: item.campaign_id,
            invoice_number: item.invoice_number || "",
          },
        });

        // Save stripe session on item
        await updateItem(item.id, { stripe_session_id: session.id });

        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "stripe", gatewayProduct: "checkout_session",
          eventType: "response_received", outcome: "pending",
          response: { session_id: session.id, status: session.status || "open" },
          durationMs: Date.now() - t0,
        }).catch(() => {});

        return apiSuccess({
          method: "stripe",
          redirect_url: session.url,
          session_id: session.id,
          amount_usd: Number(item.amount_usd),
        });
      } catch (err: unknown) {
        const stripeErr = err as { message?: string; type?: string; code?: string; statusCode?: number };
        console.error("[Pay] Stripe error details:", {
          message: stripeErr.message,
          type: stripeErr.type,
          code: stripeErr.code,
          statusCode: stripeErr.statusCode,
        });
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "stripe", gatewayProduct: "checkout_session",
          eventType: "error", outcome: "error",
          responseCode: stripeErr.code || (stripeErr.statusCode ? String(stripeErr.statusCode) : null),
          responseMessage: stripeErr.message || "unknown",
          errorCategory: classifyError("stripe", String(stripeErr.statusCode || ""), stripeErr.message),
          durationMs: Date.now() - t0,
        }).catch(() => {});
        const userMsg = stripeErr.code === "api_key_expired"
          ? "La configuración de pagos con tarjeta necesita actualización. Contacte soporte."
          : stripeErr.code === "amount_too_small"
          ? "El monto mínimo para pagar con tarjeta es $0.50 USD. Usa otro método de pago."
          : `No pudimos procesar el pago con tarjeta. Intenta nuevamente o usa otro método.`;
        return apiError(userMsg, 500);
      }
    }

    // ---- PayPal ----
    if (method === "paypal") {
      if (!isPayPalConfigured()) {
        return apiError("PayPal no está disponible en este momento", 503);
      }

      // return_url must point to our capture endpoint, NOT to the payment page
      // PayPal appends ?token={orderID}&PayerID={payerID} to the return_url
      const returnUrl = `${getAppUrl()}/api/cobranzas/webhook/paypal?collection_token=${token}`;
      const cancelUrl = `${getAppUrl()}/pagar/${token}?status=cancelled`;

      const t0 = Date.now();
      logGatewayEvent({
        collectionItemId: item.id, paymentToken: item.payment_token,
        gateway: "paypal", gatewayProduct: "order_create",
        eventType: "request_sent",
        request: { amount: Number(item.amount_usd), currency: "USD", intent: "CAPTURE" },
      }).catch(() => {});

      try {
        const order = await createPayPalOrder({
          amountUsd: Number(item.amount_usd),
          description: item.concept || "Servicio WUIPI",
          returnUrl,
          cancelUrl,
          customId: token,
        });

        await updateItem(item.id, {
          metadata: { ...((item.metadata as Record<string, unknown>) || {}), paypal_order_id: order.orderId },
        });

        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "paypal", gatewayProduct: "order_create",
          eventType: "response_received", outcome: "pending",
          response: { order_id: order.orderId, status: "CREATED" },
          durationMs: Date.now() - t0,
        }).catch(() => {});

        return apiSuccess({
          method: "paypal",
          redirect_url: order.approveUrl,
          order_id: order.orderId,
          amount_usd: Number(item.amount_usd),
        });
      } catch (err: unknown) {
        const e = err as { message?: string };
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "paypal", gatewayProduct: "order_create",
          eventType: "error", outcome: "error",
          responseMessage: e.message || "unknown",
          errorCategory: classifyError("paypal", null, e.message),
          durationMs: Date.now() - t0,
        }).catch(() => {});
        throw err;
      }
    }

    // ---- C2P Pago Movil (Paso 1: solicitar OTP) ----
    // Mercantil envia un SMS con el codigo (clave de compra) al telefono del cliente.
    // El cliente ingresa el codigo en el portal y se confirma via /api/cobranzas/pay/c2p-confirm.
    if (method === "c2p") {
      if (!parsed.data.c2p) {
        return apiError("Faltan datos de C2P (cedula, telefono, banco)", 400);
      }
      const { cedula, phone, bankCode } = parsed.data.c2p;
      const t0 = Date.now();
      logGatewayEvent({
        collectionItemId: item.id, paymentToken: item.payment_token,
        gateway: "c2p", gatewayProduct: "c2p_otp_request",
        eventType: "request_sent",
        request: { amount: amountBss, bankCode, invoiceNumber: item.invoice_number },
        amountVes: amountBss,
        customerCedulaRif: cedula,
      }).catch(() => {});
      try {
        const sdk = new MercantilSDK();
        const ip2 = getClientIP(request.headers) || "0.0.0.0";
        const ua = request.headers.get("user-agent") || "WUIPI-Portal";
        const result = await sdk.requestC2PKey(
          {
            destinationId: cedula,
            destinationMobile: phone,
          },
          { ipaddress: ip2, browser_agent: ua }
        );
        // Persist what we'll need at confirm-time so the client only sends the OTP.
        await updateItem(item.id, {
          metadata: {
            ...((item.metadata as Record<string, unknown>) || {}),
            c2p: { cedula, phone, bankCode, key_reference: result.key_reference || null, requested_at: new Date().toISOString() },
          },
        });
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "c2p", gatewayProduct: "c2p_otp_request",
          eventType: "response_received", outcome: "pending",
          response: { transactionId: result.key_reference || null, status: "OTP_SENT" },
          durationMs: Date.now() - t0,
        }).catch(() => {});
        return apiSuccess({
          method: "c2p",
          step: "otp_requested",
          message: "Te enviamos una clave por SMS. Ingresala para completar el pago.",
          amount_bss: amountBss,
          bcv_rate: bcv.usd_to_bs,
        });
      } catch (err: unknown) {
        const e = err as { message?: string; details?: Record<string, unknown> };
        console.error("[Pay] C2P key request error:", e.message, e.details || {});
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "c2p", gatewayProduct: "c2p_otp_request",
          eventType: "error", outcome: "error",
          responseMessage: e.message || "unknown",
          errorCategory: classifyError("c2p", null, e.message),
          durationMs: Date.now() - t0,
        }).catch(() => {});
        return apiError(
          e.message || "No se pudo solicitar la clave de pago movil. Verifica los datos.",
          502
        );
      }
    }

    // ---- Transferencia — no redirect, just info ----
    if (method === "transferencia") {
      return apiSuccess({
        method: "transferencia",
        bank_info: {
          banco: "Mercantil C.A., Banco Universal",
          tipo: "Cuenta Corriente",
          cuenta: "0105 0745 65 1745103031",
          rif: "J-41156771-0",
          razon_social: "WUIPI TECH, C.A.",
          pago_movil: "04248803917",
        },
        amount_bss: amountBss,
        bcv_rate: bcv.usd_to_bs,
        concepto: item.invoice_number || token,
      });
    }

    return apiError("Método de pago no soportado", 400);
  } catch (error) {
    return apiServerError(error);
  }
}
