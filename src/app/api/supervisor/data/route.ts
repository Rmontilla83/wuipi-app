import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";

export const dynamic = "force-dynamic";
export const maxDuration = 15; // Vercel Pro: data gathering (no AI)

export async function GET() {
  try {
    const data = await gatherBusinessData();
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
