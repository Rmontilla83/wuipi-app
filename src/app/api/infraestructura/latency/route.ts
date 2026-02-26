import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { getHostLatencies } from "@/lib/integrations/zabbix";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get("period") || "24h";
    const data = await getHostLatencies(period);
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
