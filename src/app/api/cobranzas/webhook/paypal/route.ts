// GET /api/cobranzas/webhook/paypal — PayPal return URL (capture + redirect)
// PayPal redirects here after user approves: ?token={orderID}&PayerID={payerID}&collection_token={wpy_xxx}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { capturePayPalOrder } from "@/lib/integrations/paypal";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

function safeRedirect(path: string) {
  return NextResponse.redirect(new URL(path, APP_URL).toString());
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return `${err.message}\n${err.stack || ""}`;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err, null, 2); } catch { return String(err); }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const paypalOrderId = searchParams.get("token");
  const payerId = searchParams.get("PayerID");
  const collectionToken = searchParams.get("collection_token");

  console.log("[PayPal Return] params:", { paypalOrderId, payerId, collectionToken });

  if (!paypalOrderId) {
    console.error("[PayPal Return] Missing order ID");
    return safeRedirect(`/pagar/${collectionToken || "error"}?status=failed`);
  }

  try {
    console.log("[PayPal Return] Capturing order:", paypalOrderId);
    const capture = await capturePayPalOrder(paypalOrderId);
    console.log("[PayPal Return] Capture:", capture.status, "ref:", capture.captureId, "customId:", capture.customId);

    const wpy_token = collectionToken || capture.customId;

    if (!wpy_token) {
      console.error("[PayPal Return] No collection token");
      return safeRedirect("/pagar/error?status=failed");
    }

    if (capture.status === "COMPLETED") {
      const item = await getItemsByToken(wpy_token);
      console.log("[PayPal Return] Item:", item ? `${item.id} status=${item.status}` : "NOT FOUND");

      if (item && item.status !== "paid") {
        // Verify captured amount matches expected amount (tolerance $0.01)
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
          console.log("[PayPal Return] Marked paid OK");
        } catch (dbErr) {
          console.error("[PayPal Return] DB update error:", serializeError(dbErr));
          // Payment was captured by PayPal — redirect to success anyway
          // The item can be reconciled manually
        }

        // Send confirmations (non-blocking)
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  console.log("[PayPal Webhook POST]", JSON.stringify(body));
  return NextResponse.json({ received: true });
}
