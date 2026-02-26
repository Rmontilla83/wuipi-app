import { getLeadStats } from "@/lib/dal/crm-ventas";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getLeadStats();
    return apiSuccess(stats);
  } catch (error) {
    return apiServerError(error);
  }
}
