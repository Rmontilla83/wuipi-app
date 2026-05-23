// ============================================================
// account.move (out_invoice) — facturas de cliente
// ============================================================

import { read, searchCount, searchRead } from "./client";
import { bool, m2oId, m2oName, mapCurrencyCode, nullable } from "./mappers";
import type {
  InvoicePaymentState,
  InvoiceState,
  OdooInvoice,
} from "@/types/odoo-domain";

const INVOICE_FIELDS = [
  "id",
  "name",
  "partner_id",
  "state",
  "payment_state",
  "invoice_date",
  "invoice_date_due",
  "amount_total",
  "amount_residual",
  "currency_id",
  "invoice_origin",
  "custom_month_billed",
  "custom_month_billed_text",
  "l10n_ve_control_number",
  "l10n_ve_invoice_date",
] as const;

interface InvoiceRaw {
  id: number;
  name: string | false;
  partner_id: [number, string] | false;
  state: InvoiceState;
  payment_state: InvoicePaymentState;
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  currency_id: [number, string] | false;
  invoice_origin: string | false;
  custom_month_billed: boolean;
  custom_month_billed_text: string | false;
  l10n_ve_control_number: string | false;
  l10n_ve_invoice_date: string | false;
}

function toDomain(raw: InvoiceRaw): OdooInvoice {
  return {
    id: raw.id,
    name: nullable<string>(raw.name) ?? `move,${raw.id}`,
    partnerId: m2oId(raw.partner_id) ?? 0,
    partnerName: m2oName(raw.partner_id) ?? "",
    state: raw.state,
    paymentState: raw.payment_state,
    invoiceDate: nullable<string>(raw.invoice_date),
    invoiceDateDue: nullable<string>(raw.invoice_date_due),
    amountTotal: raw.amount_total ?? 0,
    amountResidual: raw.amount_residual ?? 0,
    currencyId: m2oId(raw.currency_id) ?? 0,
    currencyCode: mapCurrencyCode(raw.currency_id),
    invoiceOrigin: nullable<string>(raw.invoice_origin),
    customMonthBilled: bool(raw.custom_month_billed),
    customMonthBilledText: nullable<string>(raw.custom_month_billed_text),
    controlNumber: nullable<string>(raw.l10n_ve_control_number),
    fiscalDate: nullable<string>(raw.l10n_ve_invoice_date),
  };
}

export async function getInvoice(invoiceId: number): Promise<OdooInvoice | null> {
  const list = await read<InvoiceRaw>("account.move", [invoiceId], [...INVOICE_FIELDS]);
  if (list.length === 0) return null;
  return toDomain(list[0]);
}

export interface ListInvoicesOptions {
  /** Si se omite, devuelve TODAS las invoices del partner. */
  partnerId?: number;
  /** Filtrar por state. Default: ["draft","posted"] (excluye cancelled). */
  states?: InvoiceState[];
  /** Filtrar por payment_state. Útil para "solo facturas pendientes". */
  unpaidOnly?: boolean;
  limit?: number;
  offset?: number;
  /** Orden Odoo. Default: "invoice_date_due desc". */
  order?: string;
}

export async function listInvoices(opts: ListInvoicesOptions = {}): Promise<{
  items: OdooInvoice[];
  total: number;
}> {
  const {
    partnerId,
    states = ["draft", "posted"],
    unpaidOnly = false,
    limit = 50,
    offset = 0,
    order = "invoice_date_due desc",
  } = opts;

  const domain: unknown[] = [["move_type", "=", "out_invoice"]];
  if (partnerId) {
    domain.push(["partner_id", "=", partnerId]);
  }
  if (states.length > 0) {
    domain.push(["state", "in", states]);
  }
  if (unpaidOnly) {
    domain.push(["payment_state", "in", ["not_paid", "partial", "in_payment"]]);
  }

  const [total, rows] = await Promise.all([
    searchCount("account.move", domain),
    searchRead<InvoiceRaw>("account.move", domain, {
      fields: [...INVOICE_FIELDS],
      limit,
      offset,
      order,
    }),
  ]);
  return { items: rows.map(toDomain), total };
}

/** Listado de invoices pendientes (no pagadas) de un partner — ordenadas por vencimiento. */
export async function listPendingInvoicesForPartner(partnerId: number): Promise<OdooInvoice[]> {
  const { items } = await listInvoices({
    partnerId,
    unpaidOnly: true,
    limit: 200,
    order: "invoice_date_due asc",
  });
  return items;
}
