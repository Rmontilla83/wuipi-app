export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, listServicesForPartner, getPartner } from "@/lib/integrations/odoo-new";
import { requirePermission } from "@/lib/auth/check-permission";
import type { MikrotikService } from "@/types/odoo";
import type { OdooService } from "@/types/odoo-domain";

/**
 * Adapter: OdooService (modelo nuevo wuipi.isp.service) → MikrotikService
 * (shape legacy esperado por el frontend del portal admin/cliente).
 * En Fase 5 el frontend va a leer OdooService directo y este mapper se borra.
 */
function toMikrotikService(svc: OdooService, mobile: string, phone: string): MikrotikService {
  return {
    id: svc.id,
    name: svc.reference,
    partner_id: svc.partnerId,
    partner_name: svc.partnerName,
    product_name: svc.planProductName ?? "",
    state: svc.state,
    node_name: svc.nodeName ?? "",
    node_id: svc.nodeId ?? 0,
    router_name: svc.routerName ?? "",
    router_id: svc.routerId ?? 0,
    monitoring_sector: svc.sectorName ?? "",
    ip_cpe: svc.ipCpe ?? "",
    ipv4: svc.ipCpe ?? "",
    address: svc.installationAddress ?? "",
    category: svc.planProductName?.match(/\[([^\]]+)\]/)?.[1] ?? "",
    subscription_ref: svc.subscriptionReference ?? "",
    install_date: svc.installationDate ?? "",
    suspend_date: "",
    mikrotik_activated: svc.isActive,
    to_suspend: false,
    to_change_plan: false,
    mobile,
    phone,
    payment_promise_date: "",
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isConfigured()) return apiError("Odoo no configurado", 503);

    const { partnerId } = await params;
    const pid = parseInt(partnerId, 10);
    if (isNaN(pid)) return apiError("Partner ID inválido", 400);

    const [services, partner] = await Promise.all([
      listServicesForPartner(pid),
      getPartner(pid),
    ]);

    const mobile = partner?.mobile ?? "";
    const phone = partner?.phone ?? "";
    const mapped = services.map((s) => toMikrotikService(s, mobile, phone));

    return apiSuccess({ services: mapped });
  } catch (error) {
    return apiServerError(error);
  }
}
