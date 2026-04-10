import { NextRequest } from "next/server";
import { getBequantData } from "@/lib/integrations/bequant";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { ip: string } }
) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
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
