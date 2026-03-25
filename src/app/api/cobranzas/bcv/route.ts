// GET /api/cobranzas/bcv — Obtiene tasa BCV actual (cachear 5 min)
export const dynamic = "force-dynamic";

import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";
import { NextRequest } from "next/server";

let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const amountUsd = parseFloat(searchParams.get("amount") || "0");

    // Check cache
    if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_TTL) {
      return apiSuccess({
        usd_to_bs: cachedRate.rate,
        amount_bss: amountUsd > 0 ? convertUsdToBs(amountUsd, cachedRate.rate) : undefined,
        source: "cache",
      });
    }

    const bcv = await fetchBCVRate();
    cachedRate = { rate: bcv.usd_to_bs, timestamp: Date.now() };

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
