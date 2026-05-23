// ============================================================
// contract.contract — suscripciones (modelo OCA contract extendido por Wuipi)
// ============================================================

import { read, searchRead } from "./client";
import {
  bool,
  m2oId,
  m2oName,
  mapCurrencyCode,
  mapLifecycleState,
  mapSubscriptionState,
  nullable,
} from "./mappers";
import { SUBSCRIPTION_STATE } from "./config";
import type { OdooSubscription } from "@/types/odoo-domain";

const CONTRACT_FIELDS = [
  "id",
  "name",
  "partner_id",
  "invoice_partner_id",
  "wuipi_state",
  "wuipi_subscription_state",
  "recurring_next_date",
  "recurring_interval",
  "recurring_rule_type",
  "is_overdue",
  "currency_id",
  "journal_id",
  "pricelist_id",
  "date_start",
  "date_end",
  "wuipi_default_fixed_day",
  "wuipi_isp_service_count",
] as const;

interface ContractRaw {
  id: number;
  name: string;
  partner_id: [number, string] | false;
  invoice_partner_id: [number, string] | false;
  wuipi_state: string | false;
  wuipi_subscription_state: string | false;
  recurring_next_date: string | false;
  recurring_interval: number;
  recurring_rule_type: string | false;
  is_overdue: boolean;
  currency_id: [number, string] | false;
  journal_id: [number, string] | false;
  pricelist_id: [number, string] | false;
  date_start: string | false;
  date_end: string | false;
  wuipi_default_fixed_day: number | false;
  wuipi_isp_service_count: number;
}

function toDomain(raw: ContractRaw): OdooSubscription {
  return {
    id: raw.id,
    reference: raw.name,
    partnerId: m2oId(raw.partner_id) ?? 0,
    partnerName: m2oName(raw.partner_id) ?? "",
    invoicePartnerId: m2oId(raw.invoice_partner_id) ?? m2oId(raw.partner_id) ?? 0,
    state: mapLifecycleState(raw.wuipi_state),
    subscriptionState: mapSubscriptionState(raw.wuipi_subscription_state),
    subscriptionStateRaw: typeof raw.wuipi_subscription_state === "string" ? raw.wuipi_subscription_state : "",
    recurringNextDate: nullable<string>(raw.recurring_next_date),
    recurringInterval: raw.recurring_interval ?? 1,
    recurringRuleType: nullable<string>(raw.recurring_rule_type) ?? "monthly",
    isOverdue: bool(raw.is_overdue),
    currencyId: m2oId(raw.currency_id) ?? 0,
    currencyCode: mapCurrencyCode(raw.currency_id),
    journalId: m2oId(raw.journal_id) ?? 0,
    pricelistId: m2oId(raw.pricelist_id),
    dateStart: nullable<string>(raw.date_start),
    dateEnd: nullable<string>(raw.date_end),
    fixedDay: nullable<number>(raw.wuipi_default_fixed_day),
    serviceCount: raw.wuipi_isp_service_count ?? 0,
  };
}

export async function getSubscription(id: number): Promise<OdooSubscription | null> {
  const list = await read<ContractRaw>("contract.contract", [id], [...CONTRACT_FIELDS]);
  if (list.length === 0) return null;
  return toDomain(list[0]);
}

export async function getSubscriptionByReference(reference: string): Promise<OdooSubscription | null> {
  if (!reference) return null;
  const rows = await searchRead<ContractRaw>(
    "contract.contract",
    [["name", "=", reference]],
    { fields: [...CONTRACT_FIELDS], limit: 1 },
  );
  if (rows.length === 0) return null;
  return toDomain(rows[0]);
}

export async function listSubscriptionsForPartner(
  partnerId: number,
): Promise<OdooSubscription[]> {
  const rows = await searchRead<ContractRaw>(
    "contract.contract",
    [["partner_id", "=", partnerId]],
    { fields: [...CONTRACT_FIELDS], limit: 50, order: "date_start desc" },
  );
  return rows.map(toDomain);
}

// ─── contract.line ────────────────────────────────────────────

export interface ContractLine {
  id: number;
  contractId: number;
  productCode: string;
  productName: string;
  quantity: number;
  priceUnit: number;
  priceSubtotal: number;
  discount: number;
  /** Estado nativo de la línea (active, suspended, terminated...). Best-effort. */
  state: string;
}

const LINE_FIELDS = [
  "id",
  "contract_id",
  "product_id",
  "name",
  "quantity",
  "price_unit",
  "price_subtotal",
  "discount",
  "is_canceled",
] as const;

export async function listContractLines(contractIds: number[]): Promise<ContractLine[]> {
  if (contractIds.length === 0) return [];
  const rows = await searchRead<{
    id: number;
    contract_id: [number, string] | false;
    product_id: [number, string] | false;
    name: string;
    quantity: number;
    price_unit: number;
    price_subtotal: number;
    discount: number;
    is_canceled: boolean;
  }>(
    "contract.line",
    [["contract_id", "in", contractIds]],
    { fields: [...LINE_FIELDS], limit: 500, order: "contract_id, sequence" },
  );
  return rows.map((r) => {
    const fullName = (Array.isArray(r.product_id) ? r.product_id[1] : "") || r.name || "";
    return {
      id: r.id,
      contractId: Array.isArray(r.contract_id) ? r.contract_id[0] : 0,
      productCode: fullName.match(/\[([^\]]+)\]/)?.[1] ?? "",
      productName: fullName.replace(/\[.*?\]\s*/, ""),
      quantity: r.quantity ?? 1,
      priceUnit: r.price_unit ?? 0,
      priceSubtotal: r.price_subtotal ?? 0,
      discount: r.discount ?? 0,
      state: r.is_canceled ? "closed" : "progress",
    };
  });
}

/**
 * Devuelve UNA suscripción "activa" del partner si existe exactamente una.
 * Equivalente al fallback `month_billed` del Odoo viejo: cuando una invoice
 * draft no tiene invoice_origin pero el partner tiene una sola subscription
 * activa, se usa esa.
 */
export async function findActiveSubscriptionForPartner(
  partnerId: number,
): Promise<OdooSubscription | null> {
  const rows = await searchRead<ContractRaw>(
    "contract.contract",
    [
      ["partner_id", "=", partnerId],
      ["wuipi_subscription_state", "=", SUBSCRIPTION_STATE.PROGRESS],
    ],
    { fields: [...CONTRACT_FIELDS], limit: 2 },
  );
  if (rows.length !== 1) return null;
  return toDomain(rows[0]);
}
