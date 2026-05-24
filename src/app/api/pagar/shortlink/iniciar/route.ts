// POST /api/pagar/shortlink/iniciar
// Body: { code: string }
//
// Recibe un short code de campaña Odoo (wuipi.campaign.shortlink),
// verifica el JWT firmado por Odoo contra WUIPI_PAYMENT_JWT_SECRET,
// extrae partner_id, crea (o reusa) un collection_item, y devuelve
// el payment_token wpy_xxx para que el cliente continúe al flujo
// existente /pagar/[wpy_token].
//
// Comparte la mayoría de la lógica con /api/pagar/cliente/iniciar
// (que usa permanent client tokens HMAC) — la única diferencia es de
// dónde sale el partner_id (acá del JWT del shortlink, allá del HMAC
// permanente).

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, getPartner, listInvoices } from "@/lib/integrations/odoo-new";
import { resolveShortlinkByCode, markShortlinkAccessed } from "@/lib/integrations/odoo-new/shortlinks";
import { verifyShortlinkJWT, shortlinkErrorMessage, isShortlinkCode } from "@/lib/utils/payment-shortlink";
import { createAdminSupabase } from "@/lib/supabase/server";
import { generateCollectionToken } from "@/lib/dal/collection-campaigns";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { normalizeOdooVatToCedula } from "@/lib/utils/cedula";

export const dynamic = "force-dynamic";

const CAMPAIGN_NAME = "Campañas Odoo (shortlink)";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`shortlink-iniciar:${ip}`, 20, 60_000);
    if (!rl.allowed) return apiError("Demasiadas solicitudes", 429);

    if (!isConfigured()) return apiError("Sistema no disponible", 503);

    const body = await request.json();
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!isShortlinkCode(code)) {
      return apiError("Código de enlace inválido", 400);
    }

    // 1. Resolver el shortlink en Odoo
    const shortlink = await resolveShortlinkByCode(code);
    if (!shortlink) {
      return apiError("Enlace de pago no encontrado", 404);
    }

    // 2. Verificar el JWT contra WUIPI_PAYMENT_JWT_SECRET
    const verify = verifyShortlinkJWT(shortlink.jwtToken, code);
    if (!verify.ok) {
      const status = verify.reason === "expired" ? 410 : 403;
      return apiError(shortlinkErrorMessage(verify.reason), status);
    }

    const partnerId = verify.payload.partner_id;
    if (partnerId !== shortlink.partnerId) {
      // Sanity check: el partner del shortlink debe matchear el del JWT
      return apiError("Enlace inconsistente. Pide uno nuevo.", 403);
    }

    // 3. Cargar partner + drafts del Odoo nuevo
    const [partner, draftsResult] = await Promise.all([
      getPartner(partnerId),
      listInvoices({
        partnerId,
        states: ["draft"],
        limit: 50,
        order: "invoice_date_due asc",
      }),
    ]);
    if (!partner) return apiError("Cliente no encontrado", 404);

    const drafts = draftsResult.items;
    if (drafts.length === 0) {
      return apiError("No tienes facturas pendientes. Si ya pagaste, ingresa a tu portal para verificar.", 400);
    }

    const cedulaRif = normalizeOdooVatToCedula(partner.vat, partner.isCompany, partnerId);

    // Total a cobrar = suma de todos los drafts (pago "todo").
    // Si el crédito a favor del partner es negativo (overpaid), se descuenta.
    const draftTotal = drafts.reduce((s, d) => s + d.amountTotal, 0);
    const creditFavorUsd = partner.totalReceivable < 0
      ? Math.abs(partner.totalReceivable) / 474  // BCV fallback
      : 0;
    const netDue = Math.round(Math.max(draftTotal - creditFavorUsd, 0) * 100) / 100;
    if (netDue <= 0) {
      return apiError("Tu cuenta está al día. Ingresa al portal para confirmar.", 400);
    }

    // 4. Reusar collection_item activo si ya existe para este partner
    //    (cliente que abrió el link 2 veces no genera 2 items)
    const odooInvoiceAmountsUsd: Record<number, number> = {};
    const odooInvoiceIds = drafts.map((d) => d.id);
    for (const d of drafts) odooInvoiceAmountsUsd[d.id] = d.amountTotal;

    const sb = createAdminSupabase();
    const lookupCedulas = Array.from(new Set([
      cedulaRif,
      (partner.vat ?? "").trim(),
      `odoo_${partnerId}`,
    ].filter(Boolean)));

    const { data: existing } = await sb
      .from("collection_items")
      .select("id, payment_token, amount_usd, status, metadata")
      .in("customer_cedula_rif", lookupCedulas)
      .in("status", ["pending", "sent", "viewed"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const item = existing[0];
      const existingMeta = (item.metadata ?? {}) as Record<string, unknown>;
      // Refrescar metadata si los drafts cambiaron
      const newIdsSorted = [...odooInvoiceIds].sort((a, b) => a - b);
      const oldIds = Array.isArray(existingMeta.odoo_invoice_ids)
        ? (existingMeta.odoo_invoice_ids as number[]).slice().sort((a, b) => a - b)
        : null;
      const idsChanged = !oldIds || JSON.stringify(oldIds) !== JSON.stringify(newIdsSorted);
      const amountChanged = Math.abs(Number(item.amount_usd) - netDue) > 0.01;
      if (idsChanged || amountChanged) {
        await sb.from("collection_items").update({
          amount_usd: netDue,
          metadata: {
            ...existingMeta,
            odoo_invoice_ids: newIdsSorted,
            odoo_invoice_amounts_usd: odooInvoiceAmountsUsd,
            is_pay_all: true,
            shortlink_code: code,
          },
        }).eq("id", item.id);
      }
      // Marca el shortlink como accedido (best-effort, no bloquea)
      markShortlinkAccessed(shortlink.id).catch(() => {});
      return apiSuccess({ payment_token: item.payment_token, amount: netDue });
    }

    // 5. Crear campaña genérica si no existe (snapshot del origen Odoo)
    let campaignId: string;
    const { data: campaigns } = await sb
      .from("collection_campaigns")
      .select("id")
      .eq("name", CAMPAIGN_NAME)
      .limit(1);
    if (campaigns && campaigns.length > 0) {
      campaignId = campaigns[0].id;
    } else {
      const { data: newCampaign, error: campErr } = await sb
        .from("collection_campaigns")
        .insert({
          name: CAMPAIGN_NAME,
          description: "Pagos generados desde shortlinks de campaña Odoo (wuipi.campaign.shortlink)",
          status: "active",
        })
        .select("id")
        .single();
      if (campErr) throw campErr;
      campaignId = newCampaign.id;
    }

    // 6. Crear el collection_item
    const odooInvoicesMeta = drafts.map((d) => ({
      number: d.name,
      date: d.invoiceDate || "",
      due_date: d.invoiceDateDue || "",
      total: d.amountTotal,
      amount_due: d.amountTotal,
      currency: d.currencyCode || "USD",
      products: [],
    }));

    const paymentToken = generateCollectionToken();
    const { error: insertErr } = await sb
      .from("collection_items")
      .insert({
        campaign_id: campaignId,
        payment_token: paymentToken,
        customer_name: partner.name,
        customer_cedula_rif: cedulaRif,
        customer_email: partner.email,
        customer_phone: partner.mobile,
        amount_usd: netDue,
        status: "pending",
        metadata: {
          odoo_partner_id: partnerId,
          odoo_invoices: odooInvoicesMeta,
          odoo_invoice_ids: odooInvoiceIds,
          odoo_invoice_amounts_usd: odooInvoiceAmountsUsd,
          is_pay_all: true,
          shortlink_code: code,
          shortlink_id: shortlink.id,
        },
      });
    if (insertErr) throw insertErr;

    // 7. Marcar el shortlink como accedido (best-effort)
    markShortlinkAccessed(shortlink.id).catch(() => {});

    return apiSuccess({ payment_token: paymentToken, amount: netDue });
  } catch (error) {
    return apiServerError(error);
  }
}
