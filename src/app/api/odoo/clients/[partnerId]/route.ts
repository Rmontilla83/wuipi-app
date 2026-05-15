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
    // endpoint. Priorizamos ADMIN — sin esta prioridad, un super_admin
    // que también tiene cookie wpi_session (porque probó el portal antes)
    // queda restringido a su propio partnerId y no puede ver otros
    // clientes desde /clientes/[id]. Caso reportado 2026-05-15.
    //
    // Orden:
    //  1. requirePermission(clientes, read) → admin → ver cualquiera.
    //  2. getPortalCaller() → portal client → solo SU propio data.
    //  3. Ninguno → 403.
    const admin = await requirePermission("clientes", "read");
    if (!admin) {
      const portal = await getPortalCaller();
      if (!portal) return apiError("Sin permisos", 403);
      if (portal.odoo_partner_id !== partnerId) {
        return apiError("Sin permisos", 403);
      }
      // OK — portal client viendo su propio data
    }
    // OK — admin (puede ver cualquier cliente)

    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const detail = await getOdooClientDetail(partnerId);
    return apiSuccess(detail);
  } catch (error) {
    return apiServerError(error);
  }
}
