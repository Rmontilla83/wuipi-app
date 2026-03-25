// GET /api/cobranzas/[token] — Obtiene datos del item por token (para el portal público)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { getItemsByToken, updateItem } from "@/lib/dal/collection-campaigns";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const item = await getItemsByToken(params.token);
    if (!item) {
      return apiError("Enlace de pago no encontrado o expirado", 404);
    }

    // Check expiration
    if (item.expires_at && new Date(item.expires_at) < new Date()) {
      return apiError("Este enlace de pago ha expirado", 410);
    }

    // Mark as viewed if still pending/sent
    if (item.status === "pending" || item.status === "sent") {
      await updateItem(item.id, { status: "viewed" });
      item.status = "viewed";
    }

    // Return only safe public fields
    return apiSuccess({
      token: item.payment_token,
      customer_name: item.customer_name,
      invoice_number: item.invoice_number,
      concept: item.concept,
      amount_usd: item.amount_usd,
      status: item.status,
      payment_method: item.payment_method,
      payment_reference: item.payment_reference,
      paid_at: item.paid_at,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
