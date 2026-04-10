import { getLeadStats } from "@/lib/dal/crm-ventas";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const caller = await requirePermission("ventas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const stats = await getLeadStats();
    return apiSuccess(stats);
  } catch (error) {
    return apiServerError(error);
  }
}
