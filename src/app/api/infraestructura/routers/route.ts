export const dynamic = "force-dynamic";

import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getMikrotikRouters } from "@/lib/integrations/odoo";

export async function GET() {
  try {
    if (!isOdooConfigured()) return apiError("Odoo no configurado", 503);

    const routers = await getMikrotikRouters();
    return apiSuccess({ routers });
  } catch (error) {
    return apiServerError(error);
  }
}
