import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, listInvoices, getPartner } from "@/lib/integrations/odoo-new";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

/**
 * Legacy response shape preserved: list of pending (draft) invoices
 * with embedded customer details. Frontend consumes this exact shape;
 * mapping is inline so we don't pollute odoo-new with legacy types.
 */
interface LegacyInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cedula_rif: string;
  odoo_partner_id: number;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_due: number;
  currency: string;
  payment_state: string;
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    if (!isConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Drafts = cuentas por cobrar (lo que el cliente debe)
    const { items: rawInvoices, total } = await listInvoices({
      states: ["draft"],
      limit: Math.min(limit, 500),
      offset,
      order: "invoice_date_due asc",
    });

    // Resolve unique partner IDs to enrich with cedula/email/phone.
    const uniquePartnerIds = Array.from(new Set(rawInvoices.map((i) => i.partnerId).filter(Boolean)));
    const partners = await Promise.all(uniquePartnerIds.map((pid) => getPartner(pid)));
    const partnerMap = new Map(partners.filter(Boolean).map((p) => [p!.id, p!]));

    // Apply search filter post-fetch by customer name (legacy behavior).
    const filtered = search
      ? rawInvoices.filter((inv) => {
          const partner = partnerMap.get(inv.partnerId);
          const name = partner?.name || inv.partnerName || "";
          return name.toLowerCase().includes(search.toLowerCase());
        })
      : rawInvoices;

    const invoices: LegacyInvoice[] = filtered.map((inv) => {
      const partner = partnerMap.get(inv.partnerId);
      return {
        id: inv.id,
        invoice_number: inv.name,
        customer_name: partner?.name || inv.partnerName || "",
        customer_email: partner?.email || "",
        customer_phone: partner?.mobile || partner?.phone || "",
        customer_cedula_rif: partner?.vat || "",
        odoo_partner_id: inv.partnerId,
        invoice_date: inv.invoiceDate || "",
        due_date: inv.invoiceDateDue || "",
        subtotal: inv.amountUntaxed,
        tax: inv.amountTax,
        total: inv.amountTotal,
        amount_due: inv.amountTotal, // drafts: full amount owed
        currency: inv.currencyCode || "USD",
        payment_state: "not_paid",
      };
    });

    const totalAmountDue = invoices.reduce((sum, inv) => sum + inv.amount_due, 0);

    return apiSuccess({
      invoices,
      total,
      returned: invoices.length,
      total_amount_due: Math.round(totalAmountDue * 100) / 100,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return apiServerError(error);
  }
}
