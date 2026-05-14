// /api/cobranzas/webhook/paypal
//   GET  — Return URL: PayPal redirects the user here after approval. We capture
//          the order server-side (auth'd), then mark our item paid.
//   POST — Webhook: PayPal pushes async events. Signature-verified.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { capturePayPalOrder, verifyPayPalWebhook, PayPalCaptureError } from "@/lib/integrations/paypal";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { logGatewayEvent } from "@/lib/dal/payment-gateway-logs";
import { createPaymentFailureCase, closeOpenCasesForPaidItem } from "@/lib/cobranzas/payment-failure-case";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";
const WPY_TOKEN_RE = /^wpy_[A-Za-z0-9_-]{8,64}$/;

function safeRedirect(path: string) {
  // Defense against open redirect — always build URL against our own origin.
  const clean = path.startsWith("/") ? path : "/";
  return NextResponse.redirect(new URL(clean, APP_URL).toString());
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return `${err.message}\n${err.stack || ""}`;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err, null, 2); } catch { return String(err); }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const paypalOrderId = searchParams.get("token");
  const collectionTokenRaw = searchParams.get("collection_token");

  // Validate collection_token format before using it anywhere — prevents
  // injection into our redirect path.
  const collectionToken = collectionTokenRaw && WPY_TOKEN_RE.test(collectionTokenRaw)
    ? collectionTokenRaw
    : null;

  if (!paypalOrderId) {
    return safeRedirect(`/pagar/${collectionToken || "error"}?status=failed`);
  }

  try {
    const capture = await capturePayPalOrder(paypalOrderId);

    // The authoritative binding between PayPal order ↔ our internal item is
    // `capture.customId`, which PayPal echoes back from what we set at order
    // creation. NEVER trust the querystring token over the PayPal-returned one.
    const wpy_token = capture.customId && WPY_TOKEN_RE.test(capture.customId)
      ? capture.customId
      : null;

    if (!wpy_token) {
      console.error("[PayPal Return] No valid customId from PayPal capture");
      return safeRedirect("/pagar/error?status=failed");
    }

    // If the caller also supplied a collection_token, ensure it matches the
    // authoritative customId. Mismatch = someone tampered the URL trying to
    // cross-credit a paid order to a different invoice.
    if (collectionToken && collectionToken !== wpy_token) {
      console.error(
        `[PayPal Return] token mismatch query=${collectionToken} customId=${wpy_token}`
      );
      return safeRedirect("/pagar/error?status=failed");
    }

    if (capture.status === "COMPLETED") {
      const item = await getItemsByToken(wpy_token);

      if (item && item.status !== "paid") {
        // Amount match (tolerance $0.01) — prevents partial-capture fraud.
        const expectedAmount = Number(item.amount_usd);
        const capturedAmount = parseFloat(capture.amount);
        if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
          console.error(`[PayPal Return] AMOUNT MISMATCH: expected=${expectedAmount} captured=${capturedAmount}`);
          createPaymentFailureCase({
            collectionItemId: item.id,
            gateway: "paypal",
            gatewayProduct: "order_capture",
            failureType: "amount_mismatch",
            errorMessage: `Expected $${expectedAmount}, captured $${capturedAmount}`,
          }).catch(err =>
            console.error("[PayPal Return] createPaymentFailureCase fallo:", err)
          );
          return safeRedirect(`/pagar/${wpy_token}?status=failed`);
        }

        // PayPal es USD nativo. Igual que Stripe: persistir amount_bss + bcv_rate
        // para que el sync Odoo postee la factura en VES con esa tasa, y el
        // account.payment quede en USD contra el journal PayPal USD.
        let bcvRate: number | null = null;
        let amountBss: number | null = null;
        try {
          const bcv = await fetchBCVRate();
          bcvRate = bcv.usd_to_bs;
          amountBss = convertUsdToBs(Number(item.amount_usd), bcvRate);
        } catch (err) {
          console.warn("[PayPal Return] BCV fetch failed:", err);
        }

        try {
          await markItemPaid(wpy_token, {
            payment_method: "paypal",
            payment_reference: capture.captureId,
            amount_bss: amountBss ?? undefined,
            bcv_rate: bcvRate ?? undefined,
          });
          // Log: pago PayPal capturado exitosamente
          logGatewayEvent({
            collectionItemId: item.id, paymentToken: item.payment_token,
            gateway: "paypal", gatewayProduct: "order_capture",
            eventType: "webhook_received", outcome: "success",
            response: {
              order_id: paypalOrderId,
              status: capture.status,
              capture_id: capture.captureId,
            },
            customerCedulaRif: item.customer_cedula_rif,
            customerName: item.customer_name,
            amountUsd: Number(item.amount_usd),
          }).catch(() => {});

          // Cerrar casos abiertos en kanban (PayPal exitoso post-fallos)
          closeOpenCasesForPaidItem(item.id).catch(err =>
            console.error("[PayPal Return] closeOpenCasesForPaidItem fallo:", err)
          );
        } catch (dbErr) {
          console.error("[PayPal Return] DB update error:", serializeError(dbErr));
          logGatewayEvent({
            collectionItemId: item.id, paymentToken: item.payment_token,
            gateway: "paypal", gatewayProduct: "order_capture",
            eventType: "error", outcome: "error",
            responseMessage: "DB update failed: " + (dbErr instanceof Error ? dbErr.message : "unknown"),
          }).catch(() => {});
          // Payment was captured by PayPal — redirect success anyway; reconcile manually.
        }

        // Sync Odoo: factura posted en VES (con BCV), payment USD en journal PayPal.
        try {
          const { waitUntil } = await import("@vercel/functions");
          const { triggerOdooSyncOrEnqueue } = await import("@/lib/integrations/odoo-sync-trigger");
          const itemMeta = (item.metadata as Record<string, unknown> | null) || null;
          const odooInvoiceIds = Array.isArray(itemMeta?.odoo_invoice_ids)
            ? (itemMeta!.odoo_invoice_ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0)
            : null;
          waitUntil(
            triggerOdooSyncOrEnqueue({
              collectionItemId: item.id,
              paymentToken: item.payment_token,
              customerCedulaRif: item.customer_cedula_rif,
              customerEmail: item.customer_email,
              paymentMethod: "paypal",
              paymentReference: capture.captureId,
              amountUsd: Number(item.amount_usd),
              amountVes: amountBss,  // calculado con BCV arriba
              odooInvoiceIds,
            }).catch((err) => console.error("[PayPal Return] Sync Odoo fallo:", err))
          );
        } catch (err) {
          console.error("[PayPal Return] Sync Odoo setup fallo:", err);
        }

        // Non-blocking confirmations
        const amount = `$${capture.amount} USD`;
        const concept = item.concept || "Servicio WUIPI";

        if (item.customer_phone) {
          sendPaymentConfirmationWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch((e) => console.error("[PayPal] WA error:", serializeError(e)));
        }

        if (item.customer_email) {
          sendPaymentConfirmationEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch((e) => console.error("[PayPal] Email error:", serializeError(e)));
        }
      }

      return safeRedirect(`/pagar/${wpy_token}?status=success`);
    }

    console.error("[PayPal Return] Capture not COMPLETED:", capture.status);
    logGatewayEvent({
      paymentToken: wpy_token,
      gateway: "paypal", gatewayProduct: "order_capture",
      eventType: "webhook_received", outcome: "error",
      response: { order_id: paypalOrderId, status: capture.status },
      responseCode: capture.status,
      errorCategory: "unknown",
    }).catch(() => {});
    // Auto-ticket si tenemos item: capture no COMPLETED
    {
      const itemForCase = await getItemsByToken(wpy_token);
      if (itemForCase) {
        createPaymentFailureCase({
          collectionItemId: itemForCase.id,
          gateway: "paypal",
          gatewayProduct: "order_capture",
          failureType: "gateway_error",
          errorCode: capture.status,
          errorMessage: `Capture status: ${capture.status}`,
        }).catch(err =>
          console.error("[PayPal Return] createPaymentFailureCase fallo:", err)
        );
      }
    }
    return safeRedirect(`/pagar/${wpy_token}?status=failed`);
  } catch (err) {
    console.error("[PayPal Return] EXCEPTION:", serializeError(err));

    // Si PayPal nos devolvió un error tipado (INSTRUMENT_DECLINED,
    // INSUFFICIENT_FUNDS, PAYER_CANNOT_PAY, etc.), propagamos el issue al
    // redirect para que la UI muestre un mensaje específico al cliente.
    let reasonSlug: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string = err instanceof Error ? err.message : "unknown exception";
    if (err instanceof PayPalCaptureError) {
      errorCode = err.issue;
      errorMessage = err.description || err.message;
      // Mapeo issue PayPal → slug URL (lowercase, snake_case, seguro de pasar en URL)
      reasonSlug = (err.issue || "gateway_error").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);
    }

    logGatewayEvent({
      paymentToken: collectionToken,
      gateway: "paypal", gatewayProduct: "order_capture",
      eventType: "error", outcome: "error",
      responseCode: errorCode,
      responseMessage: errorMessage,
      errorCategory: reasonSlug === "instrument_declined" ? "invalid_credentials" : "unknown",
    }).catch(() => {});

    // Auto-ticket en kanban: PayPal rechazó el pago. Failure type = gateway_error
    // o invalid_credentials según el issue. El equipo de cobranzas verá el caso.
    if (collectionToken) {
      try {
        const item = await getItemsByToken(collectionToken);
        if (item) {
          const failureType: "invalid_credentials" | "insufficient_funds" | "gateway_error" =
            reasonSlug === "instrument_declined" ? "invalid_credentials" :
            reasonSlug === "insufficient_funds" ? "insufficient_funds" :
            "gateway_error";
          createPaymentFailureCase({
            collectionItemId: item.id,
            gateway: "paypal",
            gatewayProduct: "order_capture",
            failureType,
            errorCode,
            errorMessage,
          }).catch((e) => console.error("[PayPal Return] createPaymentFailureCase fallo:", e));
        }
      } catch (e) {
        console.error("[PayPal Return] lookup item para caso fallo:", e);
      }
    }

    const params = new URLSearchParams({ status: "failed" });
    if (reasonSlug) params.set("reason", reasonSlug);
    if (errorCode) params.set("gateway_code", errorCode);
    return safeRedirect(`/pagar/${collectionToken || "error"}?${params.toString()}`);
  }
}

/**
 * Async PayPal webhook. Required headers (PayPal docs):
 *   paypal-transmission-id, paypal-transmission-time, paypal-transmission-sig,
 *   paypal-cert-url, paypal-auth-algo
 * All events are signature-verified against PayPal's official endpoint before
 * being processed. Unverified events are discarded.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const sig = await verifyPayPalWebhook({
    headers: request.headers,
    rawBody,
  });

  if (!sig.verified) {
    console.warn("[PayPal Webhook] rejected:", sig.reason);
    return NextResponse.json({ error: "unverified", reason: sig.reason }, { status: 401 });
  }

  let event: { event_type?: string; resource?: Record<string, unknown> } = {};
  try { event = JSON.parse(rawBody); } catch { /* swallow — already validated structurally */ }

  console.log(`[PayPal Webhook] verified event=${event.event_type}`);

  // Current implementation: acknowledge all verified events. Capture/refund
  // handling lives in the GET return path today; extend here when PayPal
  // push-only flows are added.
  return NextResponse.json({ received: true, event_type: event.event_type });
}
