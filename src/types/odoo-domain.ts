// ============================================================
// Tipos de dominio Odoo NEW
// Neutrales: los consumidores NO deberían depender de nombres
// de campos de Odoo. Si Odoo renombra algo, solo cambia el mapper.
// ============================================================

export type CurrencyCode = "USD" | "VED" | "EUR";

/** Lifecycle state del servicio (campo wuipi_state en contract.contract) */
export type LifecycleState = "active" | "grace_period" | "suspended" | "cancelled" | "churned";

/** Estado comercial de la suscripción (campo wuipi_subscription_state) */
export type SubscriptionState = "draft" | "renewal" | "progress" | "paused" | "churn" | "upsell";

/** Estado interno de account.move */
export type InvoiceState = "draft" | "posted" | "cancel";

/** Estado de pago (account.move.payment_state) */
export type InvoicePaymentState =
  | "not_paid"
  | "in_payment"
  | "paid"
  | "partial"
  | "reversed"
  | "invoicing_legacy";

// ─── Partner (cliente) ────────────────────────────────────────

export interface OdooPartner {
  id: number;
  name: string;
  vat: string | null;          // cédula/RIF sin prefijo (ej. "25687328")
  email: string | null;
  mobile: string | null;
  phone: string | null;
  isCompany: boolean;
  countryCode: string | null;
  /** Total a cobrar acumulado (account.partner.credit, en moneda de compañía). */
  totalReceivable: number;
}

// ─── Subscription (contract.contract) ─────────────────────────

export interface OdooSubscription {
  id: number;
  /** name del contract — referencia legible, ej. "SUB-00029" */
  reference: string;
  partnerId: number;
  partnerName: string;
  /** Contacto que recibe la factura (puede ser distinto del partner_id) */
  invoicePartnerId: number;
  state: LifecycleState;
  subscriptionState: SubscriptionState;
  /** Raw Odoo selection value (ej. "3_progress") — preserva para filtrado en frontend legacy. */
  subscriptionStateRaw: string;
  recurringNextDate: string | null;  // ISO YYYY-MM-DD
  recurringInterval: number;
  recurringRuleType: string;          // "monthly" | "yearly" | ...
  isOverdue: boolean;
  currencyId: number;
  currencyCode: CurrencyCode | null;
  journalId: number;
  pricelistId: number | null;
  dateStart: string | null;
  dateEnd: string | null;
  /** wuipi_default_fixed_day (1..28) */
  fixedDay: number | null;
  /** Cantidad de servicios ISP asociados (wuipi_isp_service_count) */
  serviceCount: number;
}

// ─── ISP Service (wuipi.isp.service) ──────────────────────────

export interface OdooService {
  id: number;
  /** name del servicio — ej. "SM000036" */
  reference: string;
  partnerId: number;
  partnerName: string;
  subscriptionId: number | null;
  subscriptionReference: string | null;
  /** Estado nativo del servicio (in_progress, paused, terminated, ...) */
  state: string;
  isActive: boolean;
  ipCpe: string | null;
  routerId: number | null;
  routerName: string | null;
  nodeId: number | null;
  nodeName: string | null;
  sectorId: number | null;
  sectorName: string | null;
  installationDate: string | null;
  installationAddress: string | null;
  planProductId: number | null;
  planProductName: string | null;
}

// ─── Invoice (account.move) ───────────────────────────────────

export interface OdooInvoice {
  id: number;
  /** Sequence number ej. "INV/2026/00001" o "00052507" */
  name: string;
  partnerId: number;
  partnerName: string;
  state: InvoiceState;
  paymentState: InvoicePaymentState;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  amountTotal: number;
  amountUntaxed: number;
  amountTax: number;
  amountResidual: number;
  currencyId: number;
  currencyCode: CurrencyCode | null;
  /** Referencia al origen — habitualmente el name de la subscription, ej. "SUB-00029" */
  invoiceOrigin: string | null;
  /** custom_month_billed (módulo wuipi_unidigital) */
  customMonthBilled: boolean;
  customMonthBilledText: string | null;
  /** SENIAT — número de control (wuipi_l10n_ve_taxes) */
  controlNumber: string | null;
  /** SENIAT — fecha/hora fiscal */
  fiscalDate: string | null;
}
