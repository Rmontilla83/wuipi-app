// GET /api/cobranzas/webhook/paypal — PayPal return URL (capture + redirect)
// PayPal redirects here after user approves: ?token={orderID}&PayerID={payerID}&collection_token={wpy_xxx}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { capturePayPalOrder } from "@/lib/integrations/paypal";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

function debugRedirect(url: string, logs: string[]) {
  // Return an HTML page that shows debug info then auto-redirects
  // This helps diagnose issues since Vercel logs get truncated
  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="3;url=${url}">
    <title>Procesando pago...</title>
    <style>body{background:#0a0a1a;color:#fff;font-family:system-ui;padding:40px;text-align:center}
    pre{background:#111;padding:16px;border-radius:8px;text-align:left;font-size:11px;color:#9ca3af;overflow-x:auto;max-width:600px;margin:16px auto}
    a{color:#F46800}</style>
  </head><body>
    <h2>Procesando tu pago...</h2>
    <p>Redirigiendo en 3 segundos... <a href="${url}">Click aquí si no redirige</a></p>
    <pre>${logs.map((l) => l.replace(/</g, "&lt;")).join("\n")}</pre>
  </body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const logs: string[] = [];
  const { searchParams } = request.nextUrl;

  // PayPal sends: token={PayPal order ID}, PayerID={payer ID}
  // We added: collection_token={wpy_xxx} in the return_url
  const paypalOrderId = searchParams.get("token");
  const payerId = searchParams.get("PayerID");
  const collectionToken = searchParams.get("collection_token");

  logs.push(`[1] Params: paypalOrderId=${paypalOrderId}, PayerID=${payerId}, collection_token=${collectionToken}`);
  logs.push(`[1] Full URL: ${request.nextUrl.toString()}`);
  logs.push(`[1] APP_URL: ${APP_URL}`);

  if (!paypalOrderId) {
    logs.push("[ERROR] Missing PayPal order ID");
    return debugRedirect(`${APP_URL}/pagar/${collectionToken || "error"}?status=failed&reason=no_order_id`, logs);
  }

  try {
    // 1. Capture the payment
    logs.push(`[2] Capturing order: ${paypalOrderId}`);
    const capture = await capturePayPalOrder(paypalOrderId);
    logs.push(`[2] Capture result: status=${capture.status}, captureId=${capture.captureId}, customId=${capture.customId}, amount=${capture.amount}`);

    // Use collection_token from our query param, or fallback to customId from PayPal
    const wpy_token = collectionToken || capture.customId;
    logs.push(`[3] wpy_token resolved: ${wpy_token}`);

    if (!wpy_token) {
      logs.push("[ERROR] No collection token found from params or capture");
      return debugRedirect(`${APP_URL}/pagar/error?status=failed&reason=no_collection_token`, logs);
    }

    if (capture.status === "COMPLETED") {
      // 2. Look up the item
      const item = await getItemsByToken(wpy_token);
      logs.push(`[4] Item lookup: ${item ? `id=${item.id} status=${item.status} name=${item.customer_name}` : "NOT FOUND"}`);

      if (item && item.status !== "paid") {
        // 3. Mark as paid
        await markItemPaid(wpy_token, {
          payment_method: "paypal",
          payment_reference: capture.captureId,
        });
        logs.push(`[5] Marked as paid, ref: ${capture.captureId}`);

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
          }).catch(() => {});
        }

        if (item.customer_email) {
          sendPaymentConfirmationEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            reference: capture.captureId,
            amount,
            concept,
          }).catch(() => {});
        }
        logs.push("[6] Confirmations sent");
      } else if (item?.status === "paid") {
        logs.push("[5] Item already paid, skipping");
      }

      // 5. Redirect to payment page with success
      const successUrl = `${APP_URL}/pagar/${wpy_token}?status=success`;
      logs.push(`[7] SUCCESS → redirecting to: ${successUrl}`);
      return debugRedirect(successUrl, logs);
    }

    // Capture returned non-COMPLETED status
    logs.push(`[ERROR] Capture status not COMPLETED: ${capture.status}`);
    return debugRedirect(`${APP_URL}/pagar/${wpy_token}?status=failed&reason=capture_${capture.status}`, logs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`[EXCEPTION] ${msg}`);
    return debugRedirect(`${APP_URL}/pagar/${collectionToken || "error"}?status=failed&reason=exception`, logs);
  }
}

// POST endpoint for PayPal IPN/webhook notifications (optional)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  console.log("[PayPal Webhook POST]", JSON.stringify(body));
  return NextResponse.json({ received: true });
}
