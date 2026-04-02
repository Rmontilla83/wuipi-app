// Shared types for Odoo data — used in both server (integrations/odoo.ts) and client components

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
}

export interface OdooCustomerBalance {
  odoo_partner_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  invoice_count: number;
  total_due: number;
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
