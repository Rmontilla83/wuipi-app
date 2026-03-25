// POST /api/cobranzas/pay — Inicia pago (genera URL Mercantil o Stripe session)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionPaySchema } from "@/lib/validations/schemas";
import { getItemsByToken, updateItem } from "@/lib/dal/collection-campaigns";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";
import { MercantilSDK } from "@/lib/mercantil";
import Stripe from "stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wuipi-app.vercel.app";

export async function POST(request: NextRequest) {
  try {
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

    const bcv = await fetchBCVRate();
    const amountBss = convertUsdToBs(Number(item.amount_usd), bcv.usd_to_bs);

    // Save BCV rate on the item for future reference
    await updateItem(item.id, {
      bcv_rate: bcv.usd_to_bs,
      amount_bss: amountBss,
    } as Record<string, unknown>);

    // ---- Débito Inmediato (Mercantil Web Button) ----
    if (method === "debito_inmediato") {
      try {
        const sdk = new MercantilSDK();
        const today = new Date().toISOString().split("T")[0];
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

        const result = sdk.createPayment({
          amount: amountBss,
          customerName: item.customer_name,
          returnUrl: `${APP_URL}/pagar/${token}?status=callback`,
          currency: "ves",
          invoiceNumber: {
            number: item.invoice_number || token,
            invoiceCreationDate: today,
            invoiceCancelledDate: dueDate,
          },
          paymentConcepts: ["b2b", "c2p", "tdd"],
        });

        return apiSuccess({
          method: "debito_inmediato",
          redirect_url: result.redirectUrl,
          amount_bss: amountBss,
          bcv_rate: bcv.usd_to_bs,
        });
      } catch (err) {
        console.error("[Pay] Mercantil SDK error:", err);
        return apiError(
          "Error al generar enlace de Mercantil. Intente con otro método de pago.",
          500
        );
      }
    }

    // ---- Stripe (USD) ----
    if (method === "stripe") {
      const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
      if (!stripeKey || stripeKey.length < 10) {
        return apiError("Pago con tarjeta internacional no disponible en este momento", 503);
      }

      try {
        const stripe = new Stripe(stripeKey);
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: item.concept || "Servicio WUIPI",
                  description: item.invoice_number ? `Factura: ${item.invoice_number}` : undefined,
                },
                unit_amount: Math.round(Number(item.amount_usd) * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${APP_URL}/pagar/${token}?status=success`,
          cancel_url: `${APP_URL}/pagar/${token}?status=cancelled`,
          metadata: {
            collection_token: token,
            item_id: item.id,
            campaign_id: item.campaign_id,
            invoice_number: item.invoice_number || "",
          },
        });

        // Save stripe session on item
        await updateItem(item.id, { stripe_session_id: session.id });

        return apiSuccess({
          method: "stripe",
          redirect_url: session.url,
          session_id: session.id,
          amount_usd: Number(item.amount_usd),
        });
      } catch (err) {
        console.error("[Pay] Stripe error:", err);
        return apiError("Error al procesar pago con tarjeta. Intente nuevamente.", 500);
      }
    }

    // ---- Transferencia — no redirect, just info ----
    if (method === "transferencia") {
      return apiSuccess({
        method: "transferencia",
        bank_info: {
          banco: "Mercantil C.A., Banco Universal",
          tipo: "Cuenta Corriente",
          cuenta: "0105 0287 05 1287005713",
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
