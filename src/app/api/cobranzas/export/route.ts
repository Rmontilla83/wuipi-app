// POST /api/cobranzas/export — Genera Excel para Odoo 18
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

    // Build rows for Odoo 18 accounting import
    const rows = paidItems.map((item) => ({
      Fecha: item.paid_at
        ? new Date(item.paid_at).toISOString().split("T")[0]
        : "",
      Referencia: item.payment_reference || "",
      Cliente: item.customer_name,
      "RIF/Cédula": item.customer_cedula_rif,
      "Monto USD": Number(item.amount_usd),
      "Monto Bs.": item.amount_bss ? Number(item.amount_bss) : "",
      "Tasa BCV": item.bcv_rate ? Number(item.bcv_rate) : "",
      "Método de pago":
        item.payment_method === "debito_inmediato"
          ? "Débito Inmediato"
          : item.payment_method === "transferencia"
          ? "Transferencia Bancaria"
          : item.payment_method === "stripe"
          ? "Tarjeta Internacional"
          : "",
      "Referencia bancaria": item.mercantil_reference || item.payment_reference || "",
      Estado: item.status === "paid" ? "Pagado" : item.status,
      "Número de factura": item.invoice_number || "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
      wch: Math.max(key.length, 15),
    }));
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Pagos");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cobranzas-${campaign.name.replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    return apiServerError(error);
  }
}
