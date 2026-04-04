// Shared types for Odoo data — used in both server (integrations/odoo.ts) and client components

export interface OdooInvoiceLineDetail {
  product_name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  price_total: number; // includes tax
}

export interface OdooInvoicePayment {
  journal_name: string;
  amount: number;
  date: string;
  ref: string;
}

export interface OdooInvoiceDetail {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total: number;
  amount_due: number;
  currency: string;
  payment_state: string;
  products: string[];
  lines: OdooInvoiceLineDetail[];
  ref: string;
  payments: OdooInvoicePayment[];
}

export interface OdooCustomerBalance {
  odoo_partner_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  invoice_count: number;
  total_due: number;       // net debt: drafts - credit_favor (in USD)
  credit_favor_usd: number; // saldo a favor converted to USD (0 if none)
  draft_total_usd: number;  // raw draft total before credit deduction
  currency: string;
  oldest_due_date: string;
  invoices: OdooInvoiceDetail[];
}

export interface OdooGroupedResponse {
  customers: OdooCustomerBalance[];
  total_customers: number;
  total_due: number;
  synced_at: string;
}

// ── Client types (Fase 3) ────────────────────────────────

export interface OdooClient {
  id: number;
  name: string;
  vat: string;
  identification_type: string; // "RIF J", "RIF V", etc.
  is_company: boolean;
  email: string;
  mobile: string;
  phone: string;
  city: string;
  state: string;
  subscription_count: number;
  subscription_status: string; // progress, paused, ""
  suspend: boolean;
  credit: number;           // total receivable
  total_invoiced: number;
  unpaid_invoices_count: number;
  // Computed from subscriptions
  service_count: number;    // total subscription lines (actual services)
  services_active: number;
  services_suspended: number;
  main_plans: string[];     // e.g. ["Fibra 300", "Beam 100"]
  mrr_usd: number;
}

export interface OdooSubscriptionLine {
  product_code: string;
  product_name: string;
  quantity: number;
  price_unit: number;
  price_subtotal: number;
  discount: number;
  service_state: string; // progress, suspended, draft, closed
}

export interface OdooSubscription {
  id: number;
  name: string;             // S21569
  state: string;            // 3_progress, 4_paused
  start_date: string;
  next_invoice_date: string;
  recurring_monthly: number; // USD
  amount_total: number;
  currency: string;
  lines: OdooSubscriptionLine[];
}

export interface OdooPayment {
  id: number;
  date: string;
  amount: number;
  currency: string;
  journal: string;          // "Banco Mercantil 9021"
  ref: string;              // bank reference / memo
}

export interface OdooClientDetail {
  // Identity
  id: number;
  name: string;
  vat: string;
  ref: string;
  identification_type: string;
  responsibility_type: string; // "Contribuyente Especial"
  is_company: boolean;
  company_type: string;

  // Contact
  email: string;
  mobile: string;
  phone: string;
  function: string;         // Job position

  // Address
  street: string;
  street2: string;
  city: string;
  state: string;
  state_id: number;
  country: string;
  zip: string;
  municipality: string;
  parish: string;
  latitude: number;
  longitude: number;

  // Financial
  credit: number;
  debit: number;
  total_invoiced: number;
  total_due: number;
  total_overdue: number;
  days_sales_outstanding: number;
  trust: string;
  followup_status: string;
  pricelist: string;

  // Subscription status
  subscription_count: number;
  subscription_status: string;
  suspend: boolean;
  not_suspend: boolean;

  // Counters
  sale_order_count: number;
  unpaid_invoices_count: number;
  ticket_count: number;

  // Tags & notes
  tags: string[];
  notes: string;

  // Related data (fetched in parallel)
  subscriptions: OdooSubscription[];
  invoices: OdooInvoiceDetail[];
  payments: OdooPayment[];
}

// ── Mikrotik / Network Infrastructure ───────────────────────

export interface MikrotikNode {
  id: number;
  name: string;
  interface_name: string;
  router_id: number;
  router_name: string;
  services_active: number;
  services_suspended: number;
  services_total: number;
}

export interface MikrotikRouter {
  id: number;
  name: string;
  ip_host: string;
  location: string;
  router_type: string;
  nodes: MikrotikNode[];
}

export interface MikrotikService {
  id: number;
  name: string;                  // SM006203
  partner_id: number;
  partner_name: string;
  product_name: string;          // [BM030SE] WUIPI Beam 30
  state: string;                 // progress | suspended | closed
  node_name: string;
  node_id: number;
  router_name: string;
  router_id: number;
  monitoring_sector: string;     // WUIP-LATS-08
  ip_cpe: string;                // 172.17.41.45
  ipv4: string;                  // 192.168.114.122
  address: string;
  category: string;              // Beam30
  subscription_ref: string;      // S20762
  install_date: string;
  suspend_date: string;
  mikrotik_activated: boolean;
  to_suspend: boolean;
  to_change_plan: boolean;
  mobile: string;
  phone: string;
  payment_promise_date: string;
}
