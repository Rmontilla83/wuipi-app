// /api/cobranzas/webhook/paypal
//   GET  — Return URL: PayPal redirects the user here after approval. We capture
//          the order server-side (auth'd), then mark our item paid.
//   POST — Webhook: PayPal pushes async events. Signature-verified.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { capturePayPalOrder, verifyPayPalWebhook } from "@/lib/integrations/paypal";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

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
          return safeRedirect(`/pagar/${wpy_token}?status=failed`);
        }

        try {
          await markItemPaid(wpy_token, {
            payment_method: "paypal",
            payment_reference: capture.captureId,
          });
        } catch (dbErr) {
          console.error("[PayPal Return] DB update error:", serializeError(dbErr));
          // Payment was captured by PayPal — redirect success anyway; reconcile manually.
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
    return safeRedirect(`/pagar/${wpy_token}?status=failed`);
  } catch (err) {
    console.error("[PayPal Return] EXCEPTION:", serializeError(err));
    return safeRedirect(`/pagar/${collectionToken || "error"}?status=failed`);
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
