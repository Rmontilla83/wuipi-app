import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { MercantilSDK } from "@/lib/mercantil";

export const dynamic = "force-dynamic";

/**
 * POST /api/mercantil/webhook
 * Receives payment notifications from Banco Mercantil.
 * Must ALWAYS return 200 to prevent Mercantil from retrying.
 * No authentication required (Mercantil doesn't send auth headers).
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminSupabase();
  let rawPayload: Record<string, unknown> | null = null;

  try {
    rawPayload = await request.json();

    // Log raw webhook immediately
    await supabase.from("payment_webhook_logs").insert({
      raw_payload: rawPayload,
      received_at: new Date().toISOString(),
    });

    const sdk = new MercantilSDK();

    if (!sdk.isConfigured) {
      console.warn("[Mercantil Webhook] SDK no configurado, registrando payload sin procesar");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Parse and decrypt the webhook payload
    const payload = sdk.parseWebhook(rawPayload as Record<string, unknown>);

    console.log(
      `[Mercantil Webhook] Status: ${payload.status} | Invoice: ${payload.invoice_number} | Ref: ${payload.reference_number} | Amount: ${payload.amount}`
    );

    // Update webhook log with parsed data
    await supabase
      .from("payment_webhook_logs")
      .update({
        invoice_number: payload.invoice_number,
        status: payload.status,
        payment_method: payload.payment_method,
        reference_number: payload.reference_number,
        amount: payload.amount,
        processed: true,
      })
      .eq("raw_payload", rawPayload);

    // Find the payment by invoice_number from metadata
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .filter("metadata->>invoice_number", "eq", payload.invoice_number)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    const payment = payments?.[0];

    if (!payment) {
      console.warn(
        `[Mercantil Webhook] No pending payment found for invoice ${payload.invoice_number}`
      );
      return NextResponse.json({ received: true, matched: false }, { status: 200 });
    }

    // Map Mercantil status to our status
    const statusMap: Record<string, string> = {
      approved: "confirmed",
      declined: "rejected",
      error: "rejected",
      pending: "pending",
    };

    const newStatus = statusMap[payload.status] || "pending";

    // Update payment record
    await supabase
      .from("payments")
      .update({
        status: newStatus,
        reference_number: payload.reference_number,
        authorization_code: payload.authorization_code || null,
        gateway_reference: payload.reference_number,
        gateway_response: payload as unknown as Record<string, unknown>,
        payment_method_name: payload.payment_method,
        completed_at: payload.status === "approved" ? new Date().toISOString() : null,
        confirmed_at: payload.status === "approved" ? new Date().toISOString() : null,
        error_message:
          payload.status === "declined" || payload.status === "error"
            ? payload.message
            : null,
      })
      .eq("id", payment.id);

    // Update payment attempt
    await supabase
      .from("payment_attempts")
      .update({
        status: payload.status,
        reference_number: payload.reference_number,
        authorization_code: payload.authorization_code || null,
        response_payload: payload as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
      })
      .eq("payment_token", payment.payment_token)
      .eq("status", "initiated");

    // If approved, update invoice status
    if (payload.status === "approved" && payment.invoice_id) {
      // The trigger update_invoice_on_payment will handle status transitions
      console.log(
        `[Mercantil Webhook] Payment approved for invoice ${payload.invoice_number} — updating invoice`
      );
    }

    return NextResponse.json(
      { received: true, matched: true, status: newStatus },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Mercantil Webhook] Processing error:", error);

    // Log the error but still return 200
    if (rawPayload) {
      await supabase
        .from("payment_webhook_logs")
        .update({
          processing_error: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("raw_payload", rawPayload);
    }

    return NextResponse.json({ received: true, error: true }, { status: 200 });
  }
}
