// POST /api/cobranzas/webhook/paypal — PayPal webhook (order capture on return)
// Also handles GET for PayPal return URL redirect
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { capturePayPalOrder } from "@/lib/integrations/paypal";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

// PayPal redirects user here after approval — capture the order
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderId = searchParams.get("token"); // PayPal sends order ID as "token" param
  const customToken = searchParams.get("custom_id");

  if (!orderId) {
    return NextResponse.redirect(`${APP_URL}/pagar/error`);
  }

  try {
    const capture = await capturePayPalOrder(orderId);

    if (capture.status === "COMPLETED" && capture.customId) {
      const item = await getItemsByToken(capture.customId);

      if (item && item.status !== "paid") {
        await markItemPaid(capture.customId, {
          payment_method: "paypal" as "stripe", // Extend type later
          payment_reference: capture.captureId,
        });

        // Send confirmations
        const amount = `$${capture.amount} USD`;
        const concept = item.concept || "Servicio WUIPI";

        if (item.customer_phone) {
          sendPaymentConfirmationWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch((err) => console.error("[PayPal] WA error:", err));
        }

        if (item.customer_email) {
          sendPaymentConfirmationEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch((err) => console.error("[PayPal] Email error:", err));
        }
      }

      // Redirect to payment page with success
      return NextResponse.redirect(`${APP_URL}/pagar/${capture.customId}?status=success`);
    }

    // Capture didn't complete
    return NextResponse.redirect(`${APP_URL}/pagar/${customToken || "error"}?status=failed`);
  } catch (err) {
    console.error("[PayPal Webhook] Error capturing order:", err);
    return NextResponse.redirect(`${APP_URL}/pagar/${customToken || "error"}?status=failed`);
  }
}

// POST endpoint for PayPal IPN/webhook notifications
export async function POST(request: NextRequest) {
  // PayPal webhook verification would go here
  // For now, the GET redirect handles the capture flow
  const body = await request.json().catch(() => ({}));
  console.log("[PayPal Webhook] Received:", JSON.stringify(body));
  return NextResponse.json({ received: true });
}
