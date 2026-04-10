export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getMikrotikNodes, searchMikrotikServices } from "@/lib/integrations/odoo";
import { requirePermission } from "@/lib/auth/check-permission";

export async function GET(req: NextRequest) {
  try {
    const caller = await requirePermission("infraestructura", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isOdooConfigured()) return apiError("Odoo no configurado", 503);

    const search = req.nextUrl.searchParams.get("search");

    if (search) {
      const results = await searchMikrotikServices(search);
      return apiSuccess({ services: results });
    }

    const nodes = await getMikrotikNodes();
    return apiSuccess({ nodes });
  } catch (error) {
    return apiServerError(error);
  }
}
