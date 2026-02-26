import { getNetworkNodes } from "@/lib/dal/facturacion";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const nodes = await getNetworkNodes();
    return apiSuccess(nodes);
  } catch (error) {
    return apiServerError(error);
  }
}
