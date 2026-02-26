import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { getInfraProblems } from "@/lib/integrations/zabbix";
import type { NextRequest } from "next/server";
import type { SeverityLevel } from "@/types/zabbix";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const severityFilter = searchParams.get("severity") as SeverityLevel | null;

    let problems = await getInfraProblems();

    if (severityFilter) {
      problems = problems.filter((p) => p.severity === severityFilter);
    }

    return apiSuccess(problems);
  } catch (error) {
    return apiServerError(error);
  }
}
