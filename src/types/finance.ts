// ===========================================
// Finance & Fiscal Venezuela Type Definitions
// ===========================================

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled" | "credit_note";
export type PaymentMethod = "transfer_bs" | "transfer_usd" | "pago_movil" | "zelle" | "cash_bs" | "cash_usd" | "crypto";
export type TaxType = "iva" | "islr" | "igtf";

export interface BCVRate {
  date: string;
  usd_to_bs: number;
  eur_to_bs: number;
  source: "bcv" | "manual";
  updated_at: string;
}

export interface Invoice {
  id: string;
  number: string; // Correlativo SENIAT: e.g. "00012345"
  control_number?: string; // Número de control
  client_id: string;
  client_name: string;
  client_rif: string;
  client_plan?: string;
  client_zone?: string;
  status: InvoiceStatus;
  // Amounts
  subtotal_usd: number;
  iva_rate: number; // 16
  iva_amount_usd: number;
  igtf_rate?: number; // 3% if applicable
  igtf_amount_usd?: number;
  total_usd: number;
  total_bs: number;
  bcv_rate: number; // Rate at invoice date
  // Payment
  payment_method?: PaymentMethod;
  paid_at?: string;
  paid_amount_usd?: number;
  paid_amount_bs?: number;
  // Retention (if applicable)
  iva_retention_rate?: number; // 75% or 100%
  iva_retention_amount?: number;
  islr_retention_rate?: number;
  islr_retention_amount?: number;
  // Dates
  issued_at: string;
  due_date: string;
  period: string; // "2026-02" format
  created_at: string;
}

export interface CollectionSummary {
  total_invoiced_usd: number;
  total_collected_usd: number;
  total_pending_usd: number;
  total_overdue_usd: number;
  collection_rate: number;
  by_method: { method: PaymentMethod; label: string; amount_usd: number; count: number }[];
  by_status: { status: InvoiceStatus; label: string; count: number; amount_usd: number }[];
}

export interface ClientDebt {
  client_id: string;
  client_name: string;
  client_rif: string;
  zone: string;
  plan: string;
  months_overdue: number;
  total_debt_usd: number;
  total_debt_bs: number;
  last_payment_date?: string;
  invoices_overdue: number;
}

export interface TaxSummary {
  period: string;
  // IVA
  iva_debito_fiscal: number; // IVA we charged
  iva_credito_fiscal: number; // IVA we paid to suppliers
  iva_to_pay: number;
  iva_retentions_received: number;
  // ISLR
  islr_retentions_made: number;
  islr_retentions_received: number;
  // IGTF
  igtf_collected: number;
  // Books
  libro_ventas_count: number;
  libro_compras_count: number;
}

export interface RevenueMetrics {
  mrr: number;
  mrr_previous: number;
  mrr_growth: number;
  arr: number;
  arpu: number;
  churn_rate: number;
  churn_revenue: number;
  new_clients_revenue: number;
  ltv: number;
}

export interface FinanceOverview {
  // Revenue
  revenue: RevenueMetrics;
  // BCV
  bcv_rate: BCVRate;
  // Collections
  collections: CollectionSummary;
  // Debtors
  top_debtors: ClientDebt[];
  total_debtors: number;
  // Taxes
  tax_summary: TaxSummary;
  // Monthly trend
  monthly_revenue: { month: string; mrr: number; collected: number; pending: number }[];
  // Plan distribution
  by_plan: { plan: string; clients: number; mrr: number; percentage: number }[];
  // Recent invoices
  recent_invoices: Invoice[];
  updated_at: string;
}

// Labels
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer_bs: "Transferencia Bs",
  transfer_usd: "Transferencia USD",
  pago_movil: "Pago Móvil",
  zelle: "Zelle",
  cash_bs: "Efectivo Bs",
  cash_usd: "Efectivo USD",
  crypto: "Crypto",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Borrador",
  issued: "Emitida",
  paid: "Pagada",
  overdue: "Vencida",
  cancelled: "Anulada",
  credit_note: "Nota de Crédito",
};
