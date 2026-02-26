import { NextRequest } from "next/server";
import { getBequantData } from "@/lib/integrations/bequant";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { ip: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") || "24h") as "24h" | "7d" | "30d";
    const planSpeedDown = searchParams.get("planSpeed")
      ? parseInt(searchParams.get("planSpeed")!)
      : undefined;

    const data = await getBequantData(params.ip, period, planSpeedDown);
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
