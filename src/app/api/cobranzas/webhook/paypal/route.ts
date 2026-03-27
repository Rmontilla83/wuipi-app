// GET /api/cobranzas/webhook/paypal — PayPal return URL (capture + redirect)
// PayPal redirects here after user approves: ?token={orderID}&PayerID={payerID}&collection_token={wpy_xxx}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { capturePayPalOrder } from "@/lib/integrations/paypal";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // PayPal sends: token={PayPal order ID}, PayerID={payer ID}
  // We added: collection_token={wpy_xxx} in the return_url
  const paypalOrderId = searchParams.get("token");
  const payerId = searchParams.get("PayerID");
  const collectionToken = searchParams.get("collection_token");

  console.log("[PayPal Return] Params:", { paypalOrderId, payerId, collectionToken });
  console.log("[PayPal Return] Full URL:", request.nextUrl.toString());

  if (!paypalOrderId) {
    console.error("[PayPal Return] Missing PayPal order ID (token param)");
    return NextResponse.redirect(`${APP_URL}/pagar/${collectionToken || "error"}?status=failed`);
  }

  try {
    // 1. Capture the payment
    console.log("[PayPal Return] Capturing order:", paypalOrderId);
    const capture = await capturePayPalOrder(paypalOrderId);
    console.log("[PayPal Return] Capture result:", JSON.stringify(capture));

    // Use collection_token from our query param, or fallback to customId from PayPal
    const wpy_token = collectionToken || capture.customId;

    if (!wpy_token) {
      console.error("[PayPal Return] No collection token found");
      return NextResponse.redirect(`${APP_URL}/pagar/error?status=failed`);
    }

    if (capture.status === "COMPLETED") {
      // 2. Look up the item
      const item = await getItemsByToken(wpy_token);
      console.log("[PayPal Return] Item found:", item ? `id=${item.id} status=${item.status}` : "NOT FOUND");

      if (item && item.status !== "paid") {
        // 3. Mark as paid
        await markItemPaid(wpy_token, {
          payment_method: "paypal",
          payment_reference: capture.captureId,
        });
        console.log("[PayPal Return] Item marked as paid, ref:", capture.captureId);

        // 4. Send confirmations (fire and forget)
        const amount = `$${capture.amount} USD`;
        const concept = item.concept || "Servicio WUIPI";

        if (item.customer_phone) {
          sendPaymentConfirmationWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch((err) => console.error("[PayPal] WA confirmation error:", err));
        }

        if (item.customer_email) {
          sendPaymentConfirmationEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch((err) => console.error("[PayPal] Email confirmation error:", err));
        }
      }

      // 5. Redirect to payment page with success
      console.log("[PayPal Return] Redirecting to success:", `${APP_URL}/pagar/${wpy_token}?status=success`);
      return NextResponse.redirect(`${APP_URL}/pagar/${wpy_token}?status=success`);
    }

    // Capture returned non-COMPLETED status
    console.error("[PayPal Return] Capture status not COMPLETED:", capture.status);
    return NextResponse.redirect(`${APP_URL}/pagar/${wpy_token}?status=failed`);
  } catch (err) {
    console.error("[PayPal Return] Error:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${APP_URL}/pagar/${collectionToken || "error"}?status=failed`);
  }
}

// POST endpoint for PayPal IPN/webhook notifications (optional, not used in current flow)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  console.log("[PayPal Webhook POST] Received:", JSON.stringify(body));
  return NextResponse.json({ received: true });
}
