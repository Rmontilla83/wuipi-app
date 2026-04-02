import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getOdooClientDetail } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { partnerId: string } }
) {
  try {
    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const partnerId = parseInt(params.partnerId, 10);
    if (isNaN(partnerId) || partnerId <= 0) {
      return apiError("ID de cliente inválido", 400);
    }

    const detail = await getOdooClientDetail(partnerId);
    return apiSuccess(detail);
  } catch (error) {
    return apiServerError(error);
  }
}
