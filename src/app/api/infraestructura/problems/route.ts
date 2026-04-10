import { apiSuccess, apiError } from "@/lib/api-helpers";
import { getInfraProblems } from "@/lib/integrations/zabbix";
import type { NextRequest } from "next/server";
import type { SeverityLevel } from "@/types/zabbix";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("infraestructura", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = request.nextUrl;
    const severityFilter = searchParams.get("severity") as SeverityLevel | null;

    let problems = await getInfraProblems();

    if (severityFilter) {
      problems = problems.filter((p) => p.severity === severityFilter);
    }

    return apiSuccess(problems);
  } catch (error) {
    console.error("Zabbix problems error:", error);
    return apiSuccess([]);
  }
}
