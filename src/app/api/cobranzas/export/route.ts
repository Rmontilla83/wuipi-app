// POST /api/cobranzas/export — Genera Excel para Odoo 18 (Plantilla Asiento Contable)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { getCampaign, getItemsByCampaign } from "@/lib/dal/collection-campaigns";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  try {
    const { campaign_id } = await request.json();
    if (!campaign_id) return apiError("campaign_id requerido", 400);

    const campaign = await getCampaign(campaign_id);
    if (!campaign) return apiError("Campaña no encontrada", 404);

    const items = await getItemsByCampaign(campaign_id);
    const paidItems = items.filter((i) => i.status === "paid");

    if (paidItems.length === 0) {
      return apiError("No hay pagos confirmados para exportar", 400);
    }

    // Build rows — Odoo 18 Asiento Contable template
    const rows = paidItems.map((item) => {
      const isStripe = item.payment_method === "stripe";
      const isBs = item.payment_method === "debito_inmediato" || item.payment_method === "transferencia";

      return {
        date: item.paid_at
          ? new Date(item.paid_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        journal_id: isStripe ? "Stripe USD" : "Banco Mercantil 3031",
        Memo: item.mercantil_reference || item.payment_reference || item.stripe_session_id || "",
        amount: isStripe
          ? Number(item.amount_usd)
          : (item.amount_bss ? Number(item.amount_bss) : Number(item.amount_usd)),
        state: "Borrador",
        Moneda: isStripe ? "USD" : "VED",
        "Cliente/proveedor": item.customer_name,
        "Tasa de Imputación": isBs && item.bcv_rate ? Number(item.bcv_rate) : "",
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws["!cols"] = [
      { wch: 12 },  // date
      { wch: 24 },  // journal_id
      { wch: 30 },  // Memo
      { wch: 14 },  // amount
      { wch: 10 },  // state
      { wch: 8 },   // Moneda
      { wch: 35 },  // Cliente/proveedor
      { wch: 18 },  // Tasa de Imputación
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Asiento Contable");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const today = new Date().toISOString().split("T")[0];

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Plantilla_Bs_V18_cobranzas_${today}.xlsx"`,
      },
    });
  } catch (error) {
    return apiServerError(error);
  }
}
