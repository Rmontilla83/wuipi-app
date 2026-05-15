import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getOdooClientDetail } from "@/lib/integrations/odoo";
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

    // Dual auth: el portal del cliente y el dashboard admin consumen este
    // endpoint. Portal client puede ver SU PROPIO data; admin puede ver
    // cualquiera.
    //   - Sin esta lógica, clientes que entran via /portal/acceso o
    //     /i/[token] reciben 403 al cargar facturas/servicios porque no
    //     están en la tabla `profiles` (esa tabla es solo para staff).
    const portal = await getPortalCaller();
    if (portal) {
      if (portal.odoo_partner_id !== partnerId) {
        return apiError("Sin permisos", 403);
      }
      // OK — portal client viendo su propio data
    } else {
      const admin = await requirePermission("clientes", "read");
      if (!admin) return apiError("Sin permisos", 403);
    }

    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const detail = await getOdooClientDetail(partnerId);
    return apiSuccess(detail);
  } catch (error) {
    return apiServerError(error);
  }
}
