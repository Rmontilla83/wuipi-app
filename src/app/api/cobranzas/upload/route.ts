// POST /api/cobranzas/upload — Recibe datos del Excel parseado, crea campaña + items
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionUploadSchema } from "@/lib/validations/schemas";
import { createCampaign, createItems } from "@/lib/dal/collection-campaigns";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(collectionUploadSchema, body);
    if (!parsed.success) {
      return apiError(parsed.error, 400);
    }

    const { campaign_name, description, rows } = parsed.data;

    // Create campaign
    const campaign = await createCampaign({
      name: campaign_name,
      description: description || undefined,
    });

    // Create items from rows (filter any remaining zero-amount rows)
    const validRows = rows.filter((r) => r.monto_usd > 0);
    const items = await createItems(
      campaign.id,
      validRows.map((r) => ({
        customer_name: r.nombre_cliente,
        customer_cedula_rif: r.cedula_rif,
        customer_email: r.email || undefined,
        customer_phone: r.telefono || undefined,
        invoice_number: r.numero_factura || undefined,
        concept: r.concepto || `Cobro — ${campaign_name}`,
        amount_usd: r.monto_usd,
      }))
    );

    return apiSuccess({
      campaign,
      items,
      summary: {
        total_items: items.length,
        total_amount_usd: items.reduce((s, i) => s + Number(i.amount_usd), 0),
      },
    }, 201);
  } catch (error) {
    return apiServerError(error);
  }
}
