// POST /api/cobranzas/pay/confirm — Confirma transferencia manual
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionConfirmTransferSchema } from "@/lib/validations/schemas";
import { getItemsByToken, updateItem } from "@/lib/dal/collection-campaigns";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(collectionConfirmTransferSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { token, reference } = parsed.data;
    const item = await getItemsByToken(token);
    if (!item) return apiError("Enlace de pago no encontrado", 404);
    if (item.status === "paid") return apiError("Este cobro ya fue pagado", 400);

    // Mark as conciliating — admin will verify via transfer search
    await updateItem(item.id, {
      status: "conciliating",
      payment_method: "transferencia",
      payment_reference: reference,
    });

    return apiSuccess({
      status: "conciliating",
      message: "Transferencia reportada. Será verificada en las próximas horas.",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
