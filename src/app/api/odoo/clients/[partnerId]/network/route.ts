export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getMikrotikServiceByPartner } from "@/lib/integrations/odoo";
import { requirePermission } from "@/lib/auth/check-permission";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isOdooConfigured()) return apiError("Odoo no configurado", 503);

    const { partnerId } = await params;
    const pid = parseInt(partnerId, 10);
    if (isNaN(pid)) return apiError("Partner ID inválido", 400);

    const services = await getMikrotikServiceByPartner(pid);
    return apiSuccess({ services });
  } catch (error) {
    return apiServerError(error);
  }
}
