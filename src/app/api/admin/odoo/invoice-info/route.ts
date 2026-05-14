// GET /api/admin/odoo/invoice-info?id=51741
//
// Inspecciona una factura específica en Odoo: estado, payment_state,
// amount_residual, y los payments asociados (si los hay). Útil para
// debugging del sync de pagos.
//
// Permisos: cobranzas:read

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { searchRead, read } from "@/lib/integrations/odoo";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    if (!idParam) return apiError("Falta query param ?id=<invoice_id>", 400);
    const invoiceId = parseInt(idParam, 10);
    if (!invoiceId) return apiError("id inválido", 400);

    const invoiceArr = await read("account.move", [invoiceId], [
      "id", "name", "state", "payment_state", "amount_total", "amount_residual",
      "currency_id", "partner_id", "invoice_date",
    ]);
    if (!invoiceArr.length) return apiError("Factura no encontrada en Odoo", 404);
    const invoice = invoiceArr[0];

    // Buscar payments asociados via account.move.line con account=receivable
    // y partner = invoice.partner. Alternativa más directa: buscar todos los
    // account.payment del partner cerca de la fecha de la factura.
    const partnerId = invoice.partner_id?.[0];
    const payments = partnerId
      ? await searchRead("account.payment", [
          ["partner_id", "=", partnerId],
          ["payment_type", "=", "inbound"],
        ], {
          fields: [
            "id", "name", "state", "amount", "currency_id", "date",
            "journal_id", "payment_method_line_id", "move_id",
            "destination_account_id", "memo", "ref",
          ],
          order: "id desc",
          limit: 10,
        })
      : [];

    return apiSuccess({ invoice, recent_payments_for_partner: payments });
  } catch (err) {
    return apiServerError(err);
  }
}
