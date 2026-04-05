import { getTicketStatsEnriched } from "@/lib/dal/tickets";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getTicketStatsEnriched();
    return apiSuccess(stats);
  } catch (error) {
    return apiServerError(error);
  }
}
