import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/mercantil/status/[token]
 * Public endpoint — returns payment status for a given token.
 * Used by the /pay/[token] checkout page to poll for status updates.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    if (!token || !token.startsWith("wpy_")) {
      return apiError("Token inválido", 400);
    }

    const supabase = createAdminSupabase();

    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        "id, payment_token, amount, currency, status, payment_method_name, reference_number, authorization_code, error_message, created_at, completed_at, expires_at, metadata, invoice_id"
      )
      .eq("payment_token", token)
      .single();

    if (error || !payment) {
      return apiError("Pago no encontrado", 404);
    }

    // Check if expired
    if (
      payment.status === "pending" &&
      payment.expires_at &&
      new Date(payment.expires_at) < new Date()
    ) {
      // Mark as expired
      await supabase
        .from("payments")
        .update({ status: "rejected", error_message: "Pago expirado" })
        .eq("id", payment.id);

      return apiSuccess({
        token: payment.payment_token,
        status: "expired",
        amount: payment.amount,
        currency: payment.currency,
        message: "El enlace de pago ha expirado",
      });
    }

    // Get invoice details if linked
    let invoiceInfo = null;
    if (payment.invoice_id) {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("invoice_number, client_name, total, balance_due, status")
        .eq("id", payment.invoice_id)
        .single();
      invoiceInfo = invoice;
    }

    return apiSuccess({
      token: payment.payment_token,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method_name,
      reference_number: payment.reference_number,
      authorization_code: payment.authorization_code,
      error_message: payment.error_message,
      created_at: payment.created_at,
      completed_at: payment.completed_at,
      invoice: invoiceInfo,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
