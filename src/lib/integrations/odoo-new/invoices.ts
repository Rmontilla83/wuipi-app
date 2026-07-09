// ============================================================
// account.move (out_invoice) — facturas de cliente
// ============================================================

import { read, searchCount, searchRead } from "./client";
import { bool, m2oId, m2oName, mapCurrencyCode, nullable } from "./mappers";
import { CURRENCY_IDS } from "./config";
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
  "amount_untaxed",
  "amount_tax",
  "amount_residual",
  "currency_id",
  "invoice_origin",
  "custom_month_billed",
  "custom_month_billed_text",
  "l10n_ve_control_number",
  "l10n_ve_invoice_date",
  "wuipi_unidigital_pdf_url",
  "wuipi_unidigital_state",
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
  amount_untaxed: number;
  amount_tax: number;
  amount_residual: number;
  currency_id: [number, string] | false;
  invoice_origin: string | false;
  custom_month_billed: boolean;
  custom_month_billed_text: string | false;
  l10n_ve_control_number: string | false;
  l10n_ve_invoice_date: string | false;
  wuipi_unidigital_pdf_url: string | false;
  wuipi_unidigital_state: string | false;
}

function toDomain(raw: InvoiceRaw): OdooInvoice {
  return {
    id: raw.id,
    // Para drafts, Odoo no asigna sequence todavía (raw.name=false). Mostramos
    // "Borrador #ID" en vez de "move,ID" para que el cliente vea algo legible.
    name: nullable<string>(raw.name) ?? `Borrador #${raw.id}`,
    partnerId: m2oId(raw.partner_id) ?? 0,
    partnerName: m2oName(raw.partner_id) ?? "",
    state: raw.state,
    paymentState: raw.payment_state,
    invoiceDate: nullable<string>(raw.invoice_date),
    invoiceDateDue: nullable<string>(raw.invoice_date_due),
    amountTotal: raw.amount_total ?? 0,
    amountUntaxed: raw.amount_untaxed ?? 0,
    amountTax: raw.amount_tax ?? 0,
    amountResidual: raw.amount_residual ?? 0,
    currencyId: m2oId(raw.currency_id) ?? 0,
    currencyCode: mapCurrencyCode(raw.currency_id),
    invoiceOrigin: nullable<string>(raw.invoice_origin),
    customMonthBilled: bool(raw.custom_month_billed),
    customMonthBilledText: nullable<string>(raw.custom_month_billed_text),
    controlNumber: nullable<string>(raw.l10n_ve_control_number),
    fiscalDate: nullable<string>(raw.l10n_ve_invoice_date),
    unidigitalPdfUrl: nullable<string>(raw.wuipi_unidigital_pdf_url),
    unidigitalState: nullable<string>(raw.wuipi_unidigital_state),
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

/**
 * Devuelve los nombres de servicio/producto de cada factura (account.move.line
 * con display_type=product). Usado para poblar el detalle "Servicio" que ve el
 * cliente en el portal de pago. Una sola query batched para N facturas.
 *
 * Normaliza "[BM020SE] WUIPI Beam 20" → "WUIPI Beam 20".
 */
export async function getInvoiceProductsByMove(moveIds: number[]): Promise<Map<number, string[]>> {
  const result = new Map<number, string[]>();
  if (moveIds.length === 0) return result;
  const rawLines = await searchRead<{
    move_id: [number, string] | false;
    product_id: [number, string] | false;
    name: string | false;
  }>(
    "account.move.line",
    [["move_id", "in", moveIds], ["display_type", "=", "product"]],
    { fields: ["move_id", "product_id", "name"], limit: 500 },
  );
  for (const l of rawLines) {
    const moveId = Array.isArray(l.move_id) ? l.move_id[0] : 0;
    if (!moveId) continue;
    const productName =
      (Array.isArray(l.product_id) ? l.product_id[1] : null) ??
      (typeof l.name === "string" ? l.name : "") ??
      "";
    const clean = productName.replace(/^\[.*?\]\s*/, "").trim();
    if (!clean) continue;
    const list = result.get(moveId) ?? [];
    list.push(clean);
    result.set(moveId, list);
  }
  return result;
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

/** Saldo anterior: una factura YA POSTEADA con residual pendiente en Bs. */
export interface PostedResidual {
  id: number;
  /** Número/secuencia de la factura (ej. "00057688"). */
  number: string;
  /** Residual FIJO en Bs (VED) — la factura ya está posteada, no se convierte. */
  residualBs: number;
  /** Vencimiento, para orden/contexto en el display. */
  dueDate: string | null;
}

/**
 * Facturas out_invoice YA POSTEADAS con residual pendiente en VED — el "saldo
 * anterior" que el portal no mostraba (solo listaba drafts). Origen típico:
 * cobro incompleto en caja → la factura se postea con payment_state="partial"
 * y un amount_residual>0 que quedaba invisible (Fase 1, diseño 2026-07-09).
 *
 * Solo VED (171): el residual es un monto FIJO en Bs (la factura ya está
 * posteada), no se convierte. Excluye `in_payment` (pago registrado NO
 * reconciliado → riesgo de doble cobro) y el micro-polvo (<= dustFloor).
 * READ-ONLY.
 */
export async function listPostedResidualsForPartner(
  partnerId: number,
  opts: { dustFloor?: number } = {},
): Promise<PostedResidual[]> {
  const dust = opts.dustFloor ?? 0.01;
  const { items } = await listInvoices({
    partnerId,
    states: ["posted"],
    unpaidOnly: true, // payment_state in [not_paid, partial, in_payment]
    limit: 50,
    order: "invoice_date_due asc",
  });
  return items
    // Excluir in_payment: pago posteado pero no reconciliado — cobrarlo otra vez
    // sería doble cobro. Solo not_paid | partial.
    .filter((inv) => inv.paymentState === "not_paid" || inv.paymentState === "partial")
    // Solo VED: el residual se trata como Bs fijo. Un posted en USD sería otro
    // caso (raro) y se maneja aparte, no acá.
    .filter((inv) => inv.currencyId === CURRENCY_IDS.VED)
    .filter((inv) => inv.amountResidual > dust)
    .map((inv) => ({
      id: inv.id,
      number: inv.name,
      residualBs: Math.round(inv.amountResidual * 100) / 100,
      dueDate: inv.invoiceDateDue,
    }));
}
