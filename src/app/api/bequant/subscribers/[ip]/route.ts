import { NextRequest } from "next/server";
import {
  getSubscriber,
  getSubscriberBandwidth, getSubscriberLatency, getSubscriberCongestion,
  getSubscriberRetransmission, getSubscriberFlows, getSubscriberVolume,
  getSubscriberTrafficAtMaxSpeed, getSubscriberDpiDownlink, getSubscriberDpiUplink,
} from "@/lib/integrations/bequant";
import { getSyncedSubscriber, logBequantAccess } from "@/lib/dal/bequant";
import { validate, bequantIpParamSchema } from "@/lib/validations/schemas";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import type { BequantSubscriberDetail } from "@/types/bequant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: { ip: string } }
) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);

    // Validate IP (prevents path traversal / injection)
    const parsed = validate(bequantIpParamSchema, { ip: params.ip });
    if (!parsed.success) return apiError(parsed.error);
    const { ip } = parsed.data;

    // Pull live metrics from BQN (undici pool reuses connections)
    const [info, bandwidth, latency, congestion, retransmission, flows, volume, tams, dpiDl, dpiUl, odooRow] =
      await Promise.all([
        getSubscriber(ip),
        getSubscriberBandwidth(ip, 5, 1),
        getSubscriberLatency(ip, 5, 1),
        getSubscriberCongestion(ip, 5, 1),
        getSubscriberRetransmission(ip, 5, 1),
        getSubscriberFlows(ip, 5, 1),
        getSubscriberVolume(ip, 5, 1),
        getSubscriberTrafficAtMaxSpeed(ip, 5, 1),
        getSubscriberDpiDownlink(ip, 5, 1),
        getSubscriberDpiUplink(ip, 5, 1),
        getSyncedSubscriber(ip),
      ]);

    if (!info) return apiError("Suscriptor no encontrado en Bequant", 404);

    const detail: BequantSubscriberDetail = {
      info,
      bandwidth, latency, congestion, retransmission, flows,
      volume, trafficAtMaxSpeed: tams,
      dpiDownlink: dpiDl, dpiUplink: dpiUl,
      odoo: odooRow ? {
        partnerId: odooRow.odoo_partner_id,
        partnerName: odooRow.odoo_partner_name,
        serviceName: null,
        serviceState: odooRow.odoo_service_state,
        productName: odooRow.odoo_product_name,
        nodeName: odooRow.odoo_node_name,
        ipCpe: odooRow.odoo_ip_cpe,
        ipv4: odooRow.odoo_ipv4,
      } : undefined,
    };

    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "view_subscriber",
      targetIp: ip,
      metadata: { partner: odooRow?.odoo_partner_name },
    });

    return apiSuccess(detail);
  } catch (error) {
    return apiServerError(error);
  }
}
