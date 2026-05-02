import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { verifyClientPaymentToken } from "@/lib/utils/payment-token";
import { isOdooConfigured, searchRead, read } from "@/lib/integrations/odoo";
import { createAdminSupabase } from "@/lib/supabase/server";
import { generateCollectionToken } from "@/lib/dal/collection-campaigns";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

const PORTAL_CAMPAIGN_NAME = "Portal Autoservicio";

/**
 * POST /api/pagar/cliente/iniciar
 * Body: { token: string }
 * Creates or reuses a collection_item for the client's current debt.
 * Returns the wpy_ payment token to redirect to /pagar/[token].
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`pagar-iniciar:${ip}`, 10, 60_000);
    if (!rl.allowed) return apiError("Demasiadas solicitudes", 429);

    if (!isOdooConfigured()) return apiError("Sistema no disponible", 503);

    const body = await request.json();
    const { token, invoice_ids } = body as { token?: string; invoice_ids?: number[] };
    if (!token || typeof token !== "string" || token.length > 100) {
      return apiError("Token requerido", 400);
    }

    const partnerId = verifyClientPaymentToken(token);
    if (!partnerId) return apiError("Token no valido", 400);

    // Get client info
    const [partner] = await read("res.partner", [partnerId], ["name", "email", "vat", "mobile", "credit"]);
    if (!partner) return apiError("Cliente no encontrado", 404);

    // Get current draft total
    const drafts = await searchRead("account.move", [
      ["partner_id", "=", partnerId],
      ["move_type", "=", "out_invoice"],
      ["state", "=", "draft"],
    ], { fields: ["id", "amount_total", "name", "invoice_date_due", "currency_id"], limit: 50 });

    // Si invoice_ids viene en el body, filtrar las facturas seleccionadas.
    // Validacion: deben pertenecer al partner (ya esta filtrado por el query)
    // y existir en `drafts`.
    let selectedDrafts = drafts;
    if (Array.isArray(invoice_ids) && invoice_ids.length > 0) {
      const ids = invoice_ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
      const draftIds = new Set(drafts.map((d: { id: number }) => d.id));
      const invalidIds = ids.filter(id => !draftIds.has(id));
      if (invalidIds.length > 0) {
        return apiError(`Facturas no validas: ${invalidIds.join(", ")}`, 400);
      }
      selectedDrafts = drafts.filter((d: { id: number }) => ids.includes(d.id));
    }

    const selectedTotal = selectedDrafts.reduce((s: number, d: { amount_total: number }) => s + (d.amount_total || 0), 0);
    const draftTotalAll = drafts.reduce((s: number, d: { amount_total: number }) => s + (d.amount_total || 0), 0);

    // El credito a favor solo se aplica cuando se paga TODO. En pago parcial
    // (invoice_ids especifico) NO se aplica para evitar inconsistencias.
    const isPayAll = !invoice_ids || invoice_ids.length === 0 || selectedDrafts.length === drafts.length;
    const creditFavorUsd = (isPayAll && partner.credit < 0) ? Math.abs(partner.credit) / 474 : 0;
    const netDue = Math.round(Math.max(selectedTotal - creditFavorUsd, 0) * 100) / 100;

    if (netDue <= 0) return apiError("No hay saldo pendiente", 400);

    const sb = createAdminSupabase();

    // Reusa item existente SOLO en el caso "pago todo" (sin invoice_ids).
    // Si el cliente pide invoice_ids especificos, siempre crea un item nuevo
    // para no mezclar selecciones distintas.
    if (isPayAll) {
      const { data: existing } = await sb
        .from("collection_items")
        .select("id, payment_token, amount_usd, status, metadata")
        .eq("customer_cedula_rif", partner.vat || `odoo_${partnerId}`)
        .in("status", ["pending", "sent", "viewed"])
        .order("created_at", { ascending: false })
        .limit(1);

      // Solo reusar si el item existente tambien era "pago todo" (no tenia
      // odoo_invoice_ids especificos).
      const reusable = existing && existing.length > 0
        && !((existing[0].metadata as Record<string, unknown> | null)?.odoo_invoice_ids);

      if (reusable) {
        const item = existing[0];
        if (Math.abs(item.amount_usd - netDue) > 0.01) {
          await sb.from("collection_items").update({ amount_usd: netDue }).eq("id", item.id);
        }
        return apiSuccess({ payment_token: item.payment_token, amount: netDue });
      }
    }

    // Get or create the portal campaign
    let campaignId: string;
    const { data: campaigns } = await sb
      .from("collection_campaigns")
      .select("id")
      .eq("name", PORTAL_CAMPAIGN_NAME)
      .limit(1);

    if (campaigns && campaigns.length > 0) {
      campaignId = campaigns[0].id;
    } else {
      const { data: newCampaign, error: campErr } = await sb
        .from("collection_campaigns")
        .insert({ name: PORTAL_CAMPAIGN_NAME, description: "Pagos generados desde el portal de clientes", status: "active" })
        .select("id")
        .single();
      if (campErr) throw campErr;
      campaignId = newCampaign.id;
    }

    // Build invoice metadata (solo de las facturas seleccionadas)
    const odooInvoices = selectedDrafts.map((d: { name: string; invoice_date_due: string; amount_total: number; currency_id: [number, string] }) => ({
      number: d.name || "Borrador",
      date: "",
      due_date: d.invoice_date_due || "",
      total: d.amount_total || 0,
      amount_due: d.amount_total || 0,
      currency: d.currency_id?.[1] || "USD",
      products: [],
    }));

    // odoo_invoice_ids: usado por el sync para saber cuales facturas postear.
    // Si el cliente eligio pago parcial, va el subset; sino vacio (sync busca
    // la draft mas reciente como antes).
    const odooInvoiceIds = isPayAll ? null : selectedDrafts.map((d: { id: number }) => d.id);

    // Create collection item
    const paymentToken = generateCollectionToken();
    const { error: insertErr } = await sb
      .from("collection_items")
      .insert({
        campaign_id: campaignId,
        payment_token: paymentToken,
        customer_name: partner.name || "",
        customer_cedula_rif: partner.vat || `odoo_${partnerId}`,
        customer_email: partner.email || null,
        customer_phone: partner.mobile || null,
        amount_usd: netDue,
        status: "pending",
        metadata: {
          odoo_partner_id: partnerId,
          odoo_invoices: odooInvoices,
          ...(odooInvoiceIds ? { odoo_invoice_ids: odooInvoiceIds } : {}),
          draft_total_all: draftTotalAll,
          is_pay_all: isPayAll,
        },
      });

    if (insertErr) throw insertErr;

    return apiSuccess({ payment_token: paymentToken, amount: netDue });
  } catch (error) {
    return apiServerError(error);
  }
}
