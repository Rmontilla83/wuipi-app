import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";
export const maxDuration = 15; // Vercel Pro: data gathering (no AI)

export async function GET() {
  try {
    const caller = await requirePermission("supervisor_ia", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const data = await gatherBusinessData();
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
