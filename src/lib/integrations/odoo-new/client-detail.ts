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
import { searchRead } from "./client";
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

  // Fetch lines for ALL invoices (drafts + posted) in one query — agrega products
  // y permite expansión en /portal/facturas para ver detalle del servicio.
  const allInvoiceIds = [...drafts.items.map(i => i.id), ...posted.items.map(i => i.id)];
  const linesByMove = new Map<number, Array<{
    product_name: string; quantity: number; price_unit: number;
    price_subtotal: number; price_total: number;
  }>>();
  if (allInvoiceIds.length > 0) {
    const rawLines = await searchRead<{
      move_id: [number, string] | false;
      product_id: [number, string] | false;
      name: string | false;
      quantity: number;
      price_unit: number;
      price_subtotal: number;
      price_total: number;
    }>(
      "account.move.line",
      [["move_id", "in", allInvoiceIds], ["display_type", "=", "product"]],
      { fields: ["move_id", "product_id", "name", "quantity", "price_unit", "price_subtotal", "price_total"], limit: 500 },
    );
    for (const l of rawLines) {
      const moveId = Array.isArray(l.move_id) ? l.move_id[0] : 0;
      const productName = (Array.isArray(l.product_id) ? l.product_id[1] : null)
        ?? (typeof l.name === "string" ? l.name : "")
        ?? "";
      // Normalizar: "[BM020SE] WUIPI Beam 20" → "WUIPI Beam 20"
      const cleanName = productName.replace(/^\[.*?\]\s*/, "");
      const list = linesByMove.get(moveId) ?? [];
      list.push({
        product_name: cleanName,
        quantity: l.quantity ?? 1,
        price_unit: l.price_unit ?? 0,
        price_subtotal: l.price_subtotal ?? 0,
        price_total: l.price_total ?? 0,
      });
      linesByMove.set(moveId, list);
    }
  }

  function makeInvoiceDetail(inv: typeof drafts.items[number], state: "draft" | "posted"): OdooInvoiceDetail {
    const lines = linesByMove.get(inv.id) ?? [];
    return {
      id: inv.id,
      invoice_number: inv.name,
      invoice_date: inv.invoiceDate ?? "",
      due_date: inv.invoiceDateDue ?? "",
      total: inv.amountTotal,
      amount_due: state === "draft" ? inv.amountTotal : 0,
      currency: inv.currencyCode ?? "USD",
      payment_state: state === "draft" ? "not_paid" : inv.paymentState,
      products: lines.map(l => l.product_name).filter(Boolean),
      lines,
      ref: "",
      payments: [],
    };
  }

  const pendingInvoices: OdooInvoiceDetail[] = drafts.items.map(inv => makeInvoiceDetail(inv, "draft"));
  const paidInvoices: OdooInvoiceDetail[] = posted.items.map(inv => makeInvoiceDetail(inv, "posted"));

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
