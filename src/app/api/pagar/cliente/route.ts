import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { verifyClientPaymentToken } from "@/lib/utils/payment-token";
import { isOdooConfigured, searchRead, read } from "@/lib/integrations/odoo";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Log fire-and-forget para diagnóstico del flow de pago desde el portal.
// El user reportó "no entra a las pasarelas, llega a pantalla error"
// pero payment_gateway_logs sólo captura el último paso (/api/cobranzas/pay)
// y queda vacío. Estos logs muestran si /api/pagar/cliente respondió bien
// y por qué.
async function logFlow(action: string, request: NextRequest, extra: Record<string, unknown> = {}) {
  try {
    const sb = createAdminSupabase();
    await sb.from("portal_invite_logs").insert({
      method: "GET",
      path: "/api/pagar/cliente",
      action: `pay_flow:${action}`,
      status_code: extra.status_code as number ?? 200,
      user_agent: request.headers.get("user-agent") || null,
      ip: getClientIP(request.headers) || null,
      referer: request.headers.get("referer") || null,
      meta: extra,
    });
  } catch {}
}

/**
 * GET /api/pagar/cliente?token=XXXX
 * Public endpoint — returns client debt info for the payment page.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`pagar-cliente:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      await logFlow("rate_limited", request, { status_code: 429 });
      return apiError("Demasiadas solicitudes", 429);
    }

    if (!isOdooConfigured()) {
      await logFlow("odoo_unavailable", request, { status_code: 503 });
      return apiError("Sistema no disponible", 503);
    }

    const token = new URL(request.url).searchParams.get("token");
    if (!token || token.length > 100) {
      await logFlow("invalid_token_param", request, { status_code: 400 });
      return apiError("Token requerido", 400);
    }

    const partnerId = verifyClientPaymentToken(token);
    if (!partnerId) {
      await logFlow("hmac_failed", request, { status_code: 400, token_prefix: token.slice(0, 8) });
      return apiError("Enlace de pago no valido", 400);
    }
    await logFlow("validated_ok", request, { partner_id: partnerId, token_prefix: token.slice(0, 8) });

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
