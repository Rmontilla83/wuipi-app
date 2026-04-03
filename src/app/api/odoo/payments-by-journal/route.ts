import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getPaymentsByJournal } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "");
    const month = parseInt(searchParams.get("month") || "");

    if (!year || !month || month < 1 || month > 12) {
      return apiError("Parámetros year y month requeridos", 400);
    }

    const data = await getPaymentsByJournal(year, month);
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
