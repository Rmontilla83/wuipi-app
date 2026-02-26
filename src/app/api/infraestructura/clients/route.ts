import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { getAPClients } from "@/lib/integrations/zabbix";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getAPClients();
    return apiSuccess(data);
  } catch (error) {
    return apiServerError(error);
  }
}
