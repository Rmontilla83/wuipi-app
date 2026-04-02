import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getOdooClients } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const result = await getOdooClients({ search, status, page, limit });
    return apiSuccess(result);
  } catch (error) {
    return apiServerError(error);
  }
}
