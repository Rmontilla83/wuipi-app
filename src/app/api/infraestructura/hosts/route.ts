import { apiSuccess, apiError } from "@/lib/api-helpers";
import { getInfraHosts } from "@/lib/integrations/zabbix";
import type { NextRequest } from "next/server";
import type { EquipmentType } from "@/types/zabbix";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("infraestructura", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = request.nextUrl;
    const typeFilter = searchParams.get("type") as EquipmentType | null;

    let hosts = await getInfraHosts();

    if (typeFilter) {
      hosts = hosts.filter((h) => h.type === typeFilter);
    }

    return apiSuccess(hosts);
  } catch (error) {
    console.error("Zabbix hosts error:", error);
    return apiSuccess([]);
  }
}
