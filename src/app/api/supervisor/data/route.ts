import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await gatherBusinessData();
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
