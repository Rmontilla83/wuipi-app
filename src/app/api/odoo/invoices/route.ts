import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getPendingInvoices } from "@/lib/integrations/odoo";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const { invoices, total } = await getPendingInvoices({
      search,
      limit: Math.min(limit, 500),
      offset,
    });

    const totalAmountDue = invoices.reduce((sum, inv) => sum + inv.amount_due, 0);

    return apiSuccess({
      invoices,
      total,
      returned: invoices.length,
      total_amount_due: Math.round(totalAmountDue * 100) / 100,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return apiServerError(error);
  }
}
