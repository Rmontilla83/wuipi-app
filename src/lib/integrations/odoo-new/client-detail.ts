// ============================================================
// Helper compartido: client detail con shape legacy OdooClientDetail
// Usado por /api/odoo/clients/[partnerId] y /api/portal/soportin.
// ============================================================

import {
  getPartner,
  listSubscriptionsForPartner,
  listContractLines,
  listInvoices,
  listServicesForPartner,
} from "./index";
import type {
  OdooClientDetail,
  OdooInvoiceDetail,
  OdooSubscription as LegacySubscription,
  OdooSubscriptionLine as LegacySubscriptionLine,
  MikrotikService as LegacyMikrotikService,
} from "@/types/odoo";

/**
 * Construye el objeto OdooClientDetail (shape legacy) desde el Odoo nuevo.
 * Si el partner no existe en el Odoo nuevo, retorna null.
 */
export async function getClientDetailNew(partnerId: number): Promise<OdooClientDetail | null> {
  const [partner, subscriptions, drafts, posted] = await Promise.all([
    getPartner(partnerId),
    listSubscriptionsForPartner(partnerId),
    listInvoices({ partnerId, states: ["draft"], limit: 100, order: "invoice_date_due desc" }),
    listInvoices({ partnerId, states: ["posted"], limit: 50, order: "invoice_date desc" }),
  ]);
  if (!partner) return null;

  // Lines for all subscriptions (one query batched)
  const allContractIds = subscriptions.map((s) => s.id);
  const allLines = await listContractLines(allContractIds);
  const linesByContract = new Map<number, LegacySubscriptionLine[]>();
  for (const l of allLines) {
    const list = linesByContract.get(l.contractId) ?? [];
    list.push({
      product_code: l.productCode,
      product_name: l.productName,
      quantity: l.quantity,
      price_unit: l.priceUnit,
      price_subtotal: l.priceSubtotal,
      discount: l.discount,
      service_state: l.state,
    });
    linesByContract.set(l.contractId, list);
  }

  const legacySubs: LegacySubscription[] = subscriptions.map((s) => {
    const lines = linesByContract.get(s.id) ?? [];
    const recurringMonthly = lines.reduce((sum, l) => sum + (l.price_subtotal ?? 0), 0);
    return {
      id: s.id,
      name: s.reference,
      state: s.subscriptionStateRaw,
      start_date: s.dateStart ?? "",
      next_invoice_date: s.recurringNextDate ?? "",
      recurring_monthly: recurringMonthly,
      amount_total: recurringMonthly,
      currency: s.currencyCode ?? "USD",
      lines,
    };
  });

  const pendingInvoices: OdooInvoiceDetail[] = drafts.items.map((inv) => ({
    id: inv.id,
    invoice_number: inv.name,
    invoice_date: inv.invoiceDate ?? "",
    due_date: inv.invoiceDateDue ?? "",
    total: inv.amountTotal,
    amount_due: inv.amountTotal,
    currency: inv.currencyCode ?? "USD",
    payment_state: "not_paid",
    products: [],
    lines: [],
    ref: "",
    payments: [],
  }));

  const paidInvoices: OdooInvoiceDetail[] = posted.items.map((inv) => ({
    id: inv.id,
    invoice_number: inv.name,
    invoice_date: inv.invoiceDate ?? "",
    due_date: inv.invoiceDateDue ?? "",
    total: inv.amountTotal,
    amount_due: 0,
    currency: inv.currencyCode ?? "USD",
    payment_state: inv.paymentState,
    products: [],
    lines: [],
    ref: "",
    payments: [],
  }));

  const invoices: OdooInvoiceDetail[] = [...pendingInvoices, ...paidInvoices];

  const draftTotalUsd = pendingInvoices.reduce((s, i) => s + i.amount_due, 0);
  const partnerCredit = partner.totalReceivable;
  const creditUsd = partnerCredit / 474;
  const netDueUsd = Math.max(draftTotalUsd + creditUsd, 0);

  return {
    id: partner.id,
    name: partner.name,
    vat: partner.vat ?? "",
    ref: "",
    identification_type: "",
    responsibility_type: "",
    is_company: partner.isCompany,
    company_type: partner.isCompany ? "company" : "person",
    email: partner.email ?? "",
    mobile: partner.mobile ?? "",
    phone: partner.phone ?? "",
    function: "",
    street: "",
    street2: "",
    city: "",
    state: "",
    state_id: 0,
    country: partner.countryCode ?? "",
    zip: "",
    municipality: "",
    parish: "",
    latitude: 0,
    longitude: 0,
    credit: partner.totalReceivable,
    debit: 0,
    total_invoiced: 0,
    total_due: Math.round(netDueUsd * 100) / 100,
    total_overdue: 0,
    days_sales_outstanding: 0,
    trust: "",
    followup_status: "",
    pricelist: "",
    subscription_count: subscriptions.length,
    subscription_status:
      subscriptions.some((s) => s.subscriptionStateRaw === "3_progress") ? "progress" : "",
    suspend: subscriptions.some((s) => s.state === "suspended"),
    not_suspend: false,
    sale_order_count: 0,
    unpaid_invoices_count: pendingInvoices.length,
    ticket_count: 0,
    tags: [],
    notes: "",
    subscriptions: legacySubs,
    invoices,
    payments: [],
  };
}

/**
 * Adapter wuipi.isp.service → shape legacy MikrotikService.
 * Necesita un partner cargado para enriquecer mobile/phone.
 */
export async function getMikrotikServicesForPartnerNew(
  partnerId: number,
): Promise<LegacyMikrotikService[]> {
  const [partner, services] = await Promise.all([
    getPartner(partnerId),
    listServicesForPartner(partnerId),
  ]);
  const mobile = partner?.mobile ?? "";
  const phone = partner?.phone ?? "";
  return services.map((svc) => ({
    id: svc.id,
    name: svc.reference,
    partner_id: svc.partnerId,
    partner_name: svc.partnerName,
    product_name: svc.planProductName ?? "",
    state: svc.state,
    node_name: svc.nodeName ?? "",
    node_id: svc.nodeId ?? 0,
    router_name: svc.routerName ?? "",
    router_id: svc.routerId ?? 0,
    monitoring_sector: svc.sectorName ?? "",
    ip_cpe: svc.ipCpe ?? "",
    ipv4: svc.ipCpe ?? "",
    address: svc.installationAddress ?? "",
    category: svc.planProductName?.match(/\[([^\]]+)\]/)?.[1] ?? "",
    subscription_ref: svc.subscriptionReference ?? "",
    install_date: svc.installationDate ?? "",
    suspend_date: "",
    mikrotik_activated: svc.isActive,
    to_suspend: false,
    to_change_plan: false,
    mobile,
    phone,
    payment_promise_date: "",
  }));
}
