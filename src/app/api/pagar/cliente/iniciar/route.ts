import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { verifyClientPaymentToken } from "@/lib/utils/payment-token";
import { isOdooConfigured, searchRead, read } from "@/lib/integrations/odoo";
import { createAdminSupabase } from "@/lib/supabase/server";
import { generateCollectionToken } from "@/lib/dal/collection-campaigns";

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
    if (!isOdooConfigured()) return apiError("Sistema no disponible", 503);

    const { token } = await request.json();
    if (!token) return apiError("Token requerido", 400);

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
    ], { fields: ["amount_total", "name", "invoice_date_due", "currency_id"], limit: 50 });

    const draftTotal = drafts.reduce((s: number, d: { amount_total: number }) => s + (d.amount_total || 0), 0);
    const creditFavorUsd = partner.credit < 0 ? Math.abs(partner.credit) / 95 : 0;
    const netDue = Math.round(Math.max(draftTotal - creditFavorUsd, 0) * 100) / 100;

    if (netDue <= 0) return apiError("No hay saldo pendiente", 400);

    const sb = createAdminSupabase();

    // Check for existing pending/viewed item for this client
    const { data: existing } = await sb
      .from("collection_items")
      .select("id, payment_token, amount_usd, status")
      .eq("customer_cedula_rif", partner.vat || `odoo_${partnerId}`)
      .in("status", ["pending", "sent", "viewed"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const item = existing[0];
      // Update amount if changed
      if (Math.abs(item.amount_usd - netDue) > 0.01) {
        await sb.from("collection_items").update({ amount_usd: netDue }).eq("id", item.id);
      }
      return apiSuccess({ payment_token: item.payment_token, amount: netDue });
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

    // Build invoice metadata
    const odooInvoices = drafts.map((d: { name: string; invoice_date_due: string; amount_total: number; currency_id: [number, string] }) => ({
      number: d.name || "Borrador",
      date: "",
      due_date: d.invoice_date_due || "",
      total: d.amount_total || 0,
      amount_due: d.amount_total || 0,
      currency: d.currency_id?.[1] || "USD",
      products: [],
    }));

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
        metadata: { odoo_partner_id: partnerId, odoo_invoices: odooInvoices },
      });

    if (insertErr) throw insertErr;

    return apiSuccess({ payment_token: paymentToken, amount: netDue });
  } catch (error) {
    return apiServerError(error);
  }
}
