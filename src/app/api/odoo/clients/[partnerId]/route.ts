import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import {
  isConfigured,
  getPartner,
  listSubscriptionsForPartner,
  listContractLines,
  listInvoices,
} from "@/lib/integrations/odoo-new";
import { requirePermission, getPortalCaller } from "@/lib/auth/check-permission";
import type {
  OdooClientDetail,
  OdooInvoiceDetail,
  OdooSubscription as LegacySubscription,
  OdooSubscriptionLine as LegacySubscriptionLine,
} from "@/types/odoo";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { partnerId: string } }
) {
  try {
    const partnerId = parseInt(params.partnerId, 10);
    if (isNaN(partnerId) || partnerId <= 0) {
      return apiError("ID de cliente inválido", 400);
    }

    // Dual auth: el portal del cliente y herramientas internas consumen este
    // endpoint. Priorizamos ADMIN para que un super_admin con cookie
    // wpi_session (por probar el portal) pueda ver otros clientes.
    const admin = await requirePermission("clientes", "read");
    if (!admin) {
      const portal = await getPortalCaller();
      if (!portal) return apiError("Sin permisos", 403);
      if (portal.odoo_partner_id !== partnerId) {
        return apiError("Sin permisos", 403);
      }
    }

    if (!isConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    // Fetch en paralelo: partner, subscriptions, drafts (debt), posted, services
    const [partner, subscriptions, drafts, posted] = await Promise.all([
      getPartner(partnerId),
      listSubscriptionsForPartner(partnerId),
      listInvoices({ partnerId, states: ["draft"], limit: 100, order: "invoice_date_due desc" }),
      listInvoices({ partnerId, states: ["posted"], limit: 50, order: "invoice_date desc" }),
    ]);

    if (!partner) {
      return apiError("Cliente no encontrado en Odoo", 404);
    }

    // Lines for all subscriptions (one query)
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

    // Map subscriptions → legacy shape
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

    // Map drafts → OdooInvoiceDetail (pendientes)
    const pendingInvoices: OdooInvoiceDetail[] = drafts.items.map((inv) => ({
      id: inv.id,
      invoice_number: inv.name,
      invoice_date: inv.invoiceDate ?? "",
      due_date: inv.invoiceDateDue ?? "",
      total: inv.amountTotal,
      amount_due: inv.amountTotal,
      currency: inv.currencyCode ?? "USD",
      payment_state: "not_paid",
      products: [],   // Fase 5: si el frontend lo necesita, agregamos query a account.move.line
      lines: [],
      ref: "",
      payments: [],
    }));

    // Map posted → OdooInvoiceDetail (pagadas)
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
      payments: [], // Fase 5: poblamos con account.payment relacionados si hace falta
    }));

    const invoices: OdooInvoiceDetail[] = [...pendingInvoices, ...paidInvoices];

    // Net debt: drafts total minus credit favor (best-effort, sin BCV exacto).
    const draftTotalUsd = pendingInvoices.reduce((s, i) => s + i.amount_due, 0);
    const partnerCredit = partner.totalReceivable;
    const creditUsd = partnerCredit / 474; // BCV fallback aproximado
    const netDueUsd = Math.max(draftTotalUsd + creditUsd, 0);

    const detail: OdooClientDetail = {
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

    return apiSuccess(detail);
  } catch (error) {
    return apiServerError(error);
  }
}
