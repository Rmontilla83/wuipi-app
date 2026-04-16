import { NextRequest } from "next/server";
import { listSyncedSubscribers, logBequantAccess } from "@/lib/dal/bequant";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    // Soporte can only access detail, not full list
    if (caller.role === "soporte") return apiError("Sin permisos para listado", 403);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
    const group = searchParams.get("group") || undefined;
    const policyRate = searchParams.get("policy") || undefined;
    const odooMatch = (searchParams.get("odooMatch") as "yes" | "no" | "all" | null) || undefined;
    const search = searchParams.get("q") || undefined;

    const data = await listSyncedSubscribers({
      limit, offset, group, policyRate,
      odooMatch: odooMatch || undefined,
      search,
    });

    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "view_list",
      metadata: { limit, offset, group, policyRate, odooMatch, search },
    });

    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
