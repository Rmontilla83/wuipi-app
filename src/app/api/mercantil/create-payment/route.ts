import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { MercantilSDK } from "@/lib/mercantil";
import { generatePaymentToken } from "@/lib/mercantil/utils/helpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/mercantil/create-payment
 * Creates a Mercantil payment and returns the redirect URL + payment token.
 *
 * Body: { invoice_id: string } or { amount: number, description: string, customer_email?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("mercantil", "create");
    if (!caller) return apiError("Sin permisos", 403);

    const body = await request.json();
    const supabase = createAdminSupabase();

    let invoiceNumber: string;
    let amount: number;
    let customerEmail: string | undefined;
    let invoiceId: string | undefined;
    let clientId: string | undefined;

    // Mode 1: Pay an existing invoice
    if (body.invoice_id) {
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .select("*, clients(email)")
        .eq("id", body.invoice_id)
        .single();

      if (invErr || !invoice) {
        return apiError("Factura no encontrada", 404);
      }

      if (invoice.status === "paid") {
        return apiError("Esta factura ya está pagada", 400);
      }

      invoiceNumber = invoice.invoice_number;
      amount = invoice.balance_due > 0 ? invoice.balance_due : invoice.total;
      customerEmail = invoice.clients?.email || body.customer_email;
      invoiceId = invoice.id;
      clientId = invoice.client_id;
    }
    // Mode 2: Custom amount payment
    else if (body.amount) {
      if (!body.amount || body.amount <= 0) {
        return apiError("Monto inválido", 400);
      }
      invoiceNumber = `CUSTOM-${Date.now()}`;
      amount = body.amount;
      customerEmail = body.customer_email;
    } else {
      return apiError("Debe proveer invoice_id o amount", 400);
    }

    // Generate payment token
    const paymentToken = generatePaymentToken();

    // Get return URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";
    const returnUrl = `${appUrl}/api/mercantil/callback?token=${paymentToken}`;

    // Create SDK and build payment URL
    const sdk = new MercantilSDK();

    let redirectUrl: string;
    let transactionData: string | undefined;

    const today = new Date().toISOString().split("T")[0];
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0];

    if (sdk.isProductConfigured('web_button')) {
      const payment = sdk.createPayment({
        amount,
        customerName: body.customer_name || "Cliente WUIPI",
        returnUrl,
        currency: "ves",
        invoiceNumber: {
          number: invoiceNumber,
          invoiceCreationDate: today,
          invoiceCancelledDate: dueDate,
        },
        trxType: "compra",
        paymentConcepts: ["b2b", "c2p", "tdd"],
      });
      redirectUrl = payment.redirectUrl;
      transactionData = payment.transactionData;
    } else {
      // Web button product not configured
      redirectUrl = `${appUrl}/pay/${paymentToken}?sandbox=true`;
    }

    // Create payment record in DB
    const { data: paymentRecord, error: payErr } = await supabase
      .from("payments")
      .insert({
        payment_number: `PAG-MER-${Date.now()}`,
        client_id: clientId || null,
        invoice_id: invoiceId || null,
        payment_method_id: null, // Will be resolved by method selection
        amount,
        currency: "VES",
        status: "pending",
        payment_token: paymentToken,
        redirect_url: redirectUrl,
        return_url: returnUrl,
        customer_email: customerEmail || null,
        customer_phone: body.customer_phone || null,
        metadata: { invoice_number: invoiceNumber, transaction_data: transactionData },
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
        payment_date: new Date().toISOString().split("T")[0],
        created_by: "mercantil-gateway",
      })
      .select()
      .single();

    if (payErr) {
      console.error("[Mercantil] Error creating payment record:", payErr);
      return apiServerError(payErr);
    }

    // Create payment attempt log
    await supabase.from("payment_attempts").insert({
      payment_id: paymentRecord.id,
      invoice_id: invoiceId || null,
      payment_token: paymentToken,
      amount,
      method: "web_button",
      status: "initiated",
      redirect_url: redirectUrl,
      request_payload: { invoiceNumber, amount, customerEmail },
    });

    console.log(`[Mercantil] Payment created: ${paymentToken} for ${invoiceNumber} — $${amount}`);

    return apiSuccess({
      payment_token: paymentToken,
      redirect_url: redirectUrl,
      amount,
      invoice_number: invoiceNumber,
      expires_at: paymentRecord.expires_at,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
