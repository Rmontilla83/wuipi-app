import { apiSuccess } from "@/lib/api-helpers";
import { getInfraOverview } from "@/lib/integrations/zabbix";
import type { InfraOverview } from "@/types/zabbix";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getInfraOverview();
    return apiSuccess(data);
  } catch (error) {
    console.error("Zabbix overview error:", error);
    const fallback: InfraOverview = {
      totalHosts: 0, hostsUp: 0, hostsDown: 0, hostsUnknown: 0,
      uptimePercent: 0,
      problemsBySeverity: { not_classified: 0, information: 0, warning: 0, average: 0, high: 0, disaster: 0 },
      healthScore: 0, totalProblems: 0, sites: [], zabbixConnected: false,
      updatedAt: new Date().toISOString(),
    };
    return apiSuccess(fallback);
  }
}
