import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, authenticate } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado — faltan variables de entorno", 503);
    }

    const uid = await authenticate();

    return apiSuccess({
      status: "connected",
      uid,
      url: process.env.ODOO_URL,
      db: process.env.ODOO_DB,
      user: process.env.ODOO_USER,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
