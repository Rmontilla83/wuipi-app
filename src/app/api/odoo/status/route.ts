import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, authenticate, NEW_ODOO_DB } from "@/lib/integrations/odoo-new";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isConfigured()) {
      return apiError("Odoo no está configurado — faltan variables de entorno", 503);
    }

    const uid = await authenticate();

    return apiSuccess({
      status: "connected",
      uid,
      url: process.env.ODOO_BASE_URL,
      db: NEW_ODOO_DB,
      user: process.env.ODOO_INT_LOGIN,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
