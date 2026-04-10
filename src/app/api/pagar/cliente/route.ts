import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { verifyClientPaymentToken } from "@/lib/utils/payment-token";
import { isOdooConfigured, searchRead, read } from "@/lib/integrations/odoo";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/pagar/cliente?token=XXXX
 * Public endpoint — returns client debt info for the payment page.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`pagar-cliente:${ip}`, 20, 60_000);
    if (!rl.allowed) return apiError("Demasiadas solicitudes", 429);

    if (!isOdooConfigured()) return apiError("Sistema no disponible", 503);

    const token = new URL(request.url).searchParams.get("token");
    if (!token || token.length > 100) return apiError("Token requerido", 400);

    const partnerId = verifyClientPaymentToken(token);
    if (!partnerId) return apiError("Enlace de pago no valido", 400);

    // Fetch partner basic info
    const [partner] = await read("res.partner", [partnerId], ["name", "email", "vat", "mobile", "credit"]);
    if (!partner) return apiError("Cliente no encontrado", 404);

    // Fetch draft invoices (pending debt)
    const drafts = await searchRead("account.move", [
      ["partner_id", "=", partnerId],
      ["move_type", "=", "out_invoice"],
      ["state", "=", "draft"],
    ], {
      fields: ["name", "amount_total", "invoice_date_due", "currency_id"],
      limit: 50,
      order: "invoice_date_due asc",
    });

    // Fetch draft lines for detail
    const draftIds = drafts.map((d: any) => d.id);
    const linesByInvoice: Record<number, Array<{ product_name: string; price_total: number }>> = {};
    if (draftIds.length > 0) {
      const lines = await searchRead("account.move.line", [
        ["move_id", "in", draftIds],
        ["display_type", "=", "product"],
      ], {
        fields: ["move_id", "product_id", "price_total"],
        limit: 500,
      });
      for (const l of lines) {
        const mid = l.move_id[0];
        if (!linesByInvoice[mid]) linesByInvoice[mid] = [];
        linesByInvoice[mid].push({
          product_name: l.product_id?.[1]?.replace(/\[.*?\]\s*/, "") || "",
          price_total: l.price_total || 0,
        });
      }
    }

    const draftTotal = drafts.reduce((s: number, d: any) => s + (d.amount_total || 0), 0);
    // credit > 0 = owes (posted unpaid VED), credit < 0 = overpaid (favor)
    const creditUsd = (partner.credit || 0) / 474;
    const creditFavorUsd = partner.credit < 0 ? Math.abs(partner.credit) / 474 : 0;
    const netDue = Math.max(draftTotal + creditUsd, 0);

    const invoices = drafts.map((d: any) => ({
      id: d.id,
      due_date: d.invoice_date_due || "",
      total: d.amount_total || 0,
      currency: d.currency_id?.[1] || "USD",
      lines: linesByInvoice[d.id] || [],
    }));

    return apiSuccess({
      partner_id: partnerId,
      name: partner.name || "",
      email: partner.email || "",
      vat: partner.vat || "",
      draft_total: Math.round(draftTotal * 100) / 100,
      credit_favor_usd: Math.round(creditFavorUsd * 100) / 100,
      net_due: Math.round(netDue * 100) / 100,
      invoices,
      token,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
