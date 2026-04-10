import { getNetworkNodes } from "@/lib/dal/facturacion";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const nodes = await getNetworkNodes();
    return apiSuccess(nodes);
  } catch (error) {
    return apiServerError(error);
  }
}
