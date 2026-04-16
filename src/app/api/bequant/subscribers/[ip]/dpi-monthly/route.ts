import { NextRequest } from "next/server";
import { listSubscriberMonthlyDpi, logBequantAccess } from "@/lib/dal/bequant";
import { validate, bequantIpParamSchema } from "@/lib/validations/schemas";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { ip: string } }
) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const parsed = validate(bequantIpParamSchema, { ip: params.ip });
    if (!parsed.success) return apiError(parsed.error);
    const { ip } = parsed.data;

    const rows = await listSubscriberMonthlyDpi(ip, 12);

    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "view_subscriber",
      targetIp: ip,
      metadata: { view: "dpi_monthly", months: rows.length },
    });

    return apiSuccess(rows);
  } catch (error) {
    return apiServerError(error);
  }
}
