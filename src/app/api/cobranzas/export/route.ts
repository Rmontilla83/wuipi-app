// POST /api/cobranzas/export — Genera Excel para Odoo 18 (Plantilla Asiento Contable)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { getCampaign, getItemsByCampaign } from "@/lib/dal/collection-campaigns";
import ExcelJS from "exceljs";

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "export");
    if (!caller) return apiError("Sin permisos", 403);

    const { campaign_id } = await request.json();
    if (!campaign_id) return apiError("campaign_id requerido", 400);

    const campaign = await getCampaign(campaign_id);
    if (!campaign) return apiError("Campaña no encontrada", 404);

    const items = await getItemsByCampaign(campaign_id);
    const paidItems = items.filter((i) => i.status === "paid");

    if (paidItems.length === 0) {
      return apiError("No hay pagos confirmados para exportar", 400);
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Asiento Contable");

    ws.columns = [
      { header: "date", key: "date", width: 12 },
      { header: "journal_id", key: "journal_id", width: 24 },
      { header: "Memo", key: "memo", width: 30 },
      { header: "amount", key: "amount", width: 14 },
      { header: "state", key: "state", width: 10 },
      { header: "Moneda", key: "moneda", width: 8 },
      { header: "Cliente/proveedor", key: "cliente", width: 35 },
      { header: "Tasa de Imputación", key: "tasa", width: 18 },
    ];

    for (const item of paidItems) {
      const isStripe = item.payment_method === "stripe";
      const isBs = item.payment_method === "debito_inmediato" || item.payment_method === "transferencia";
      ws.addRow({
        date: item.paid_at
          ? new Date(item.paid_at).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        journal_id: isStripe ? "Stripe USD" : "Banco Mercantil 3031",
        memo: item.mercantil_reference || item.payment_reference || item.stripe_session_id || "",
        amount: isStripe
          ? Number(item.amount_usd)
          : (item.amount_bss ? Number(item.amount_bss) : Number(item.amount_usd)),
        state: "Borrador",
        moneda: isStripe ? "USD" : "VED",
        cliente: item.customer_name,
        tasa: isBs && item.bcv_rate ? Number(item.bcv_rate) : "",
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
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
