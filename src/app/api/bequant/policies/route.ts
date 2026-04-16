import { listPolicies } from "@/lib/dal/bequant";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

// READ-ONLY module: no POST/PUT/DELETE allowed. Policies are managed directly
// in the BQN appliance by the network engineer.
export async function GET() {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const policies = await listPolicies();
    return apiSuccess(policies);
  } catch (error) {
    return apiServerError(error);
  }
}
