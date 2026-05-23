// ============================================================
// wuipi.isp.service — servicio ISP del cliente
// ============================================================

import { read, searchRead } from "./client";
import { bool, m2oId, m2oName, nullable } from "./mappers";
import type { OdooService } from "@/types/odoo-domain";

const SERVICE_FIELDS = [
  "id",
  "name",
  "partner_id",
  "subscription_id",
  "state",
  "is_active",
  "ip_cpe",
  "router_id",
  "node_id",
  "sector_id",
  "installation_date",
  "installation_address",
  "wuipi_plan_product_id",
] as const;

interface ServiceRaw {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  subscription_id: [number, string] | false;
  state: string;
  is_active: boolean;
  ip_cpe: string | false;
  router_id: [number, string] | false;
  node_id: [number, string] | false;
  sector_id: [number, string] | false;
  installation_date: string | false;
  installation_address: string | false;
  wuipi_plan_product_id: [number, string] | false;
}

function toDomain(raw: ServiceRaw): OdooService {
  return {
    id: raw.id,
    reference: raw.name,
    partnerId: m2oId(raw.partner_id) ?? 0,
    partnerName: m2oName(raw.partner_id) ?? "",
    subscriptionId: m2oId(raw.subscription_id),
    subscriptionReference: m2oName(raw.subscription_id),
    state: raw.state,
    isActive: bool(raw.is_active),
    ipCpe: nullable<string>(raw.ip_cpe),
    routerId: m2oId(raw.router_id),
    routerName: m2oName(raw.router_id),
    nodeId: m2oId(raw.node_id),
    nodeName: m2oName(raw.node_id),
    sectorId: m2oId(raw.sector_id),
    sectorName: m2oName(raw.sector_id),
    installationDate: nullable<string>(raw.installation_date),
    installationAddress: nullable<string>(raw.installation_address),
    planProductId: m2oId(raw.wuipi_plan_product_id),
    planProductName: m2oName(raw.wuipi_plan_product_id),
  };
}

export async function getService(id: number): Promise<OdooService | null> {
  const list = await read<ServiceRaw>("wuipi.isp.service", [id], [...SERVICE_FIELDS]);
  if (list.length === 0) return null;
  return toDomain(list[0]);
}

export async function listServicesForPartner(partnerId: number): Promise<OdooService[]> {
  const rows = await searchRead<ServiceRaw>(
    "wuipi.isp.service",
    [["partner_id", "=", partnerId]],
    { fields: [...SERVICE_FIELDS], limit: 50, order: "name asc" },
  );
  return rows.map(toDomain);
}

export async function listServicesForSubscription(subscriptionId: number): Promise<OdooService[]> {
  const rows = await searchRead<ServiceRaw>(
    "wuipi.isp.service",
    [["subscription_id", "=", subscriptionId]],
    { fields: [...SERVICE_FIELDS], limit: 50, order: "name asc" },
  );
  return rows.map(toDomain);
}
