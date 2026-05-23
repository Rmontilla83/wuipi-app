import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured } from "@/lib/integrations/odoo-new";
import { getClientDetailNew } from "@/lib/integrations/odoo-new/client-detail";
import { requirePermission, getPortalCaller } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { partnerId: string } }
) {
  try {
    const partnerId = parseInt(params.partnerId, 10);
    if (isNaN(partnerId) || partnerId <= 0) {
      return apiError("ID de cliente inválido", 400);
    }

    // Dual auth: admin (super_admin) puede ver cualquier cliente; portal
    // client solo puede ver SU propio data.
    const admin = await requirePermission("clientes", "read");
    if (!admin) {
      const portal = await getPortalCaller();
      if (!portal) return apiError("Sin permisos", 403);
      if (portal.odoo_partner_id !== partnerId) {
        return apiError("Sin permisos", 403);
      }
    }

    if (!isConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const detail = await getClientDetailNew(partnerId);
    if (!detail) {
      return apiError("Cliente no encontrado en Odoo", 404);
    }
    return apiSuccess(detail);
  } catch (error) {
    return apiServerError(error);
  }
}
