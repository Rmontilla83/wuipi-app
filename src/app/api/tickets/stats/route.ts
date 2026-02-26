import { getTicketStats } from "@/lib/dal/tickets";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getTicketStats();
    return apiSuccess(stats);
  } catch (error) {
    return apiServerError(error);
  }
}
