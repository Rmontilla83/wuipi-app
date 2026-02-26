import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { getInfraHosts } from "@/lib/integrations/zabbix";
import type { NextRequest } from "next/server";
import type { EquipmentType } from "@/types/zabbix";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const typeFilter = searchParams.get("type") as EquipmentType | null;

    let hosts = await getInfraHosts();

    if (typeFilter) {
      hosts = hosts.filter((h) => h.type === typeFilter);
    }

    return apiSuccess(hosts);
  } catch (error) {
    return apiServerError(error);
  }
}
