import { NextResponse } from "next/server";
import type { FinanceOverview } from "@/types/finance";

const MOCK: FinanceOverview = {
  revenue: {
    mrr: 12450,
    mrr_previous: 11450,
    mrr_growth: 8.7,
    arr: 149400,
    arpu: 18.5,
    churn_rate: 2.1,
    churn_revenue: 261,
    new_clients_revenue: 1261,
    ltv: 888,
  },

  bcv_rate: {
    date: new Date().toISOString().split("T")[0],
    usd_to_bs: 78.50,
    eur_to_bs: 85.20,
    source: "bcv",
    updated_at: new Date().toISOString(),
  },

  collections: {
    total_invoiced_usd: 12450,
    total_collected_usd: 11080,
    total_pending_usd: 1370,
    total_overdue_usd: 2340,
    collection_rate: 89.0,
    by_method: [
      { method: "pago_movil", label: "Pago Móvil", amount_usd: 4432, count: 412 },
      { method: "transfer_bs", label: "Transferencia Bs", amount_usd: 3324, count: 245 },
      { method: "zelle", label: "Zelle", amount_usd: 1993, count: 89 },
      { method: "transfer_usd", label: "Transferencia USD", amount_usd: 887, count: 34 },
      { method: "cash_bs", label: "Efectivo Bs", amount_usd: 332, count: 67 },
      { method: "cash_usd", label: "Efectivo USD", amount_usd: 112, count: 8 },
    ],
    by_status: [
      { status: "paid", label: "Pagadas", count: 855, amount_usd: 11080 },
      { status: "issued", label: "Emitidas", count: 89, amount_usd: 1370 },
      { status: "overdue", label: "Vencidas", count: 47, amount_usd: 2340 },
      { status: "cancelled", label: "Anuladas", count: 5, amount_usd: 92 },
      { status: "credit_note", label: "Notas de Crédito", count: 3, amount_usd: 55 },
    ],
  },

  top_debtors: [
    { client_id: "d1", client_name: "Comercial El Puerto C.A.", client_rif: "J-41234567-8", zone: "Barcelona-Centro", plan: "Empresarial 100Mbps", months_overdue: 4, total_debt_usd: 320, total_debt_bs: 25120, last_payment_date: "2025-10-15", invoices_overdue: 4 },
    { client_id: "d2", client_name: "Inversiones Caribe 2020", client_rif: "J-50987654-3", zone: "Lechería-Norte", plan: "Empresarial 50Mbps", months_overdue: 3, total_debt_usd: 210, total_debt_bs: 16485, last_payment_date: "2025-11-20", invoices_overdue: 3 },
    { client_id: "d3", client_name: "Panadería La Esquina", client_rif: "J-31456789-0", zone: "Puerto La Cruz", plan: "Pyme 30Mbps", months_overdue: 3, total_debt_usd: 105, total_debt_bs: 8242, last_payment_date: "2025-11-05", invoices_overdue: 3 },
    { client_id: "d4", client_name: "Roberto Mendoza", client_rif: "V-18765432-1", zone: "Barcelona-Sur", plan: "Hogar 30Mbps", months_overdue: 3, total_debt_usd: 54, total_debt_bs: 4239, last_payment_date: "2025-11-28", invoices_overdue: 3 },
    { client_id: "d5", client_name: "María Quintero", client_rif: "V-20123456-7", zone: "Lechería-Norte", plan: "Hogar 50Mbps", months_overdue: 2, total_debt_usd: 50, total_debt_bs: 3925, last_payment_date: "2025-12-10", invoices_overdue: 2 },
    { client_id: "d6", client_name: "Farmacia Salud Plus", client_rif: "J-41567890-2", zone: "Barcelona-Centro", plan: "Pyme 50Mbps", months_overdue: 2, total_debt_usd: 80, total_debt_bs: 6280, last_payment_date: "2025-12-15", invoices_overdue: 2 },
  ],
  total_debtors: 47,

  tax_summary: {
    period: "2026-02",
    iva_debito_fiscal: 1992,
    iva_credito_fiscal: 580,
    iva_to_pay: 1412,
    iva_retentions_received: 423,
    islr_retentions_made: 156,
    islr_retentions_received: 0,
    igtf_collected: 89,
    libro_ventas_count: 996,
    libro_compras_count: 34,
  },

  monthly_revenue: [
    { month: "Sep", mrr: 9800, collected: 8820, pending: 980 },
    { month: "Oct", mrr: 10200, collected: 9384, pending: 816 },
    { month: "Nov", mrr: 10850, collected: 9982, pending: 868 },
    { month: "Dic", mrr: 11200, collected: 10192, pending: 1008 },
    { month: "Ene", mrr: 11450, collected: 10534, pending: 916 },
    { month: "Feb", mrr: 12450, collected: 11080, pending: 1370 },
  ],

  by_plan: [
    { plan: "Hogar 30Mbps", clients: 487, mrr: 4383, percentage: 35.2 },
    { plan: "Hogar 50Mbps", clients: 312, mrr: 4680, percentage: 37.6 },
    { plan: "Hogar 100Mbps", clients: 89, mrr: 1780, percentage: 14.3 },
    { plan: "Pyme 30Mbps", clients: 45, mrr: 675, percentage: 5.4 },
    { plan: "Pyme 50Mbps", clients: 28, mrr: 560, percentage: 4.5 },
    { plan: "Empresarial", clients: 12, mrr: 372, percentage: 3.0 },
  ],

  recent_invoices: [
    { id: "inv1", number: "00012456", client_id: "c1", client_name: "Ana Torres", client_rif: "V-19876543-2", status: "paid", subtotal_usd: 15, iva_rate: 16, iva_amount_usd: 2.40, total_usd: 17.40, total_bs: 1365.90, bcv_rate: 78.50, payment_method: "pago_movil", paid_at: new Date(Date.now() - 2 * 3600000).toISOString(), issued_at: new Date(Date.now() - 5 * 86400000).toISOString(), due_date: new Date(Date.now() + 10 * 86400000).toISOString(), period: "2026-02", created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: "inv2", number: "00012457", client_id: "c2", client_name: "Carlos Ruiz", client_rif: "V-20345678-9", status: "issued", subtotal_usd: 25, iva_rate: 16, iva_amount_usd: 4.00, total_usd: 29.00, total_bs: 2276.50, bcv_rate: 78.50, issued_at: new Date(Date.now() - 3 * 86400000).toISOString(), due_date: new Date(Date.now() + 12 * 86400000).toISOString(), period: "2026-02", created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
    { id: "inv3", number: "00012458", client_id: "c3", client_name: "Comercial El Puerto C.A.", client_rif: "J-41234567-8", status: "overdue", subtotal_usd: 80, iva_rate: 16, iva_amount_usd: 12.80, total_usd: 92.80, total_bs: 7284.80, bcv_rate: 78.50, issued_at: new Date(Date.now() - 35 * 86400000).toISOString(), due_date: new Date(Date.now() - 5 * 86400000).toISOString(), period: "2026-01", created_at: new Date(Date.now() - 35 * 86400000).toISOString() },
  ],

  updated_at: new Date().toISOString(),
};

export async function GET() {
  try {
    // TODO: Fetch real data from Supabase + BCV API
    return NextResponse.json(MOCK);
  } catch (error) {
    console.error("Finance data error:", error);
    return NextResponse.json(MOCK);
  }
}
