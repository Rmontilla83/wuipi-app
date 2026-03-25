// GET /api/cobranzas/bcv — Obtiene tasa BCV actual
export const dynamic = "force-dynamic";

import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const amountUsd = parseFloat(searchParams.get("amount") || "0");

    const bcv = await fetchBCVRate();

    return apiSuccess({
      usd_to_bs: bcv.usd_to_bs,
      amount_bss: amountUsd > 0 ? convertUsdToBs(amountUsd, bcv.usd_to_bs) : undefined,
      source: bcv.source,
      updated_at: bcv.updated_at,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
