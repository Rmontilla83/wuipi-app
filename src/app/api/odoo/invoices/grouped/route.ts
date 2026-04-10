import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getPendingByCustomer } from "@/lib/integrations/odoo";
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
    const minAmount = parseFloat(searchParams.get("min_amount") || "0") || undefined;

    const result = await getPendingByCustomer({ search, minAmount });

    return apiSuccess({
      ...result,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return apiServerError(error);
  }
}
