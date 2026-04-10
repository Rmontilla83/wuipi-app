export const dynamic = "force-dynamic";

import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getMikrotikRouters } from "@/lib/integrations/odoo";
import { requirePermission } from "@/lib/auth/check-permission";

export async function GET() {
  try {
    const caller = await requirePermission("infraestructura", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isOdooConfigured()) return apiError("Odoo no configurado", 503);

    const routers = await getMikrotikRouters();
    return apiSuccess({ routers });
  } catch (error) {
    return apiServerError(error);
  }
}
