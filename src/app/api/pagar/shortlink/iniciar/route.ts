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

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, getPartner, listInvoices, getInvoiceProductsByMove, listPostedResidualsForPartner, type PostedResidual } from "@/lib/integrations/odoo-new";
import { resolveShortlinkByCode, markShortlinkAccessed } from "@/lib/integrations/odoo-new/shortlinks";
import { verifyShortlinkJWT, shortlinkErrorMessage, isShortlinkCode } from "@/lib/utils/payment-shortlink";
import { createAdminSupabase } from "@/lib/supabase/server";
import { generateCollectionToken } from "@/lib/dal/collection-campaigns";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { normalizeOdooVatToCedula } from "@/lib/utils/cedula";
import { isSaldoAnteriorEnabledForPartner } from "@/lib/cobranzas/saldo-anterior";

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
      // Estado feliz: cliente sin facturas pendientes. No es un error — el
      // cliente solo necesita saber que ya no debe nada. Devolvemos 200 con
      // `code` discriminador para que el front renderice una tarjeta amigable
      // en vez del cartel rojo "Enlace no disponible".
      return NextResponse.json(
        {
          code: "no_drafts_pending",
          customer_name: partner.name,
          portal_url: "https://api.wuipi.net/portal/acceso",
        },
        { status: 200 },
      );
    }

    const cedulaRif = normalizeOdooVatToCedula(partner.vat, partner.isCompany, partnerId);

    // Total a cobrar = suma de todos los drafts (pago "todo").
    // Si el crédito a favor del partner es negativo (overpaid), se descuenta.
    const draftTotal = drafts.reduce((s, d) => s + d.amountTotal, 0);
    // Saldo a favor (anticipo, cta 2105007): fuente autoritativa = helper Odoo,
    // NO la tasa vieja hardcodeada /474 (incidente 2026-06-30). Si el helper
    // falla, NO descontar (cobra el total; el anticipo se aplica en Odoo al
    // sincronizar) — preferible cobrar de más que de menos.
    let creditFavorUsd = 0;
    try {
      const { getPartnerAnticipo } = await import("@/lib/integrations/odoo");
      const anticipo = await getPartnerAnticipo(partnerId);
      creditFavorUsd = anticipo.has_anticipo ? anticipo.usd : 0;
    } catch (err) {
      console.warn("[pagar/shortlink/iniciar] getPartnerAnticipo fallo:", err);
    }
    const netDue = Math.round(Math.max(draftTotal - creditFavorUsd, 0) * 100) / 100;
    if (netDue <= 0) {
      // Saldo a favor cubre todos los drafts → cuenta al día.
      return NextResponse.json(
        {
          code: "account_at_zero",
          customer_name: partner.name,
          portal_url: "https://api.wuipi.net/portal/acceso",
        },
        { status: 200 },
      );
    }

    // ── Fase 1 — SALDO ANTERIOR (flag PORTAL_SALDO_ANTERIOR_ENABLED) ──────────
    // Igual que en /api/pagar/cliente/iniciar: facturas posteadas con residual
    // (típ. cobro incompleto en caja) que el portal no mostraba. Aditivo y
    // gateado: flag OFF → postedResidualMeta = {} → byte-idéntico. El residual
    // solo viaja cuando hay drafts (sin drafts ya retornamos "no_drafts_pending").
    const saldoAnteriorEnabled = isSaldoAnteriorEnabledForPartner(partnerId);
    let postedResiduals: PostedResidual[] = [];
    if (saldoAnteriorEnabled) {
      try {
        postedResiduals = await listPostedResidualsForPartner(partnerId);
      } catch (err) {
        console.warn("[pagar/shortlink/iniciar] listPostedResidualsForPartner fallo:", err);
      }
    }
    const postedResidualsBs: Record<number, number> = {};
    let postedResidualTotalBs = 0;
    for (const r of postedResiduals) {
      postedResidualsBs[r.id] = r.residualBs;
      postedResidualTotalBs += r.residualBs;
    }
    postedResidualTotalBs = Math.round(postedResidualTotalBs * 100) / 100;
    const postedResidualMeta: Record<string, unknown> = saldoAnteriorEnabled
      ? {
          odoo_posted_residual_ids: postedResiduals.map((r) => r.id),
          odoo_posted_residuals_bs: postedResidualsBs,
          odoo_posted_residuals: postedResiduals.map((r) => ({
            number: r.number,
            residual_bs: r.residualBs,
            due_date: r.dueDate || "",
          })),
          posted_residual_total_bs: postedResidualTotalBs,
        }
      : {};

    // 4. Reusar collection_item activo si ya existe para este partner
    //    (cliente que abrió el link 2 veces no genera 2 items)
    const odooInvoiceAmountsUsd: Record<number, number> = {};
    const odooInvoiceIds = drafts.map((d) => d.id);
    for (const d of drafts) odooInvoiceAmountsUsd[d.id] = d.amountTotal;

    // Detalle de facturas (number + servicio + monto), construido una vez y
    // usado al crear y al reusar — así el display nunca queda desfasado.
    const productsByMove = await getInvoiceProductsByMove(drafts.map((d) => d.id));
    const odooInvoicesMeta = drafts.map((d) => ({
      number: d.name,
      date: d.invoiceDate || "",
      due_date: d.invoiceDateDue || "",
      total: d.amountTotal,
      amount_due: d.amountTotal,
      currency: d.currencyCode || "USD",
      products: productsByMove.get(d.id) ?? [],
    }));

    const sb = createAdminSupabase();
    const lookupCedulas = Array.from(new Set([
      cedulaRif,
      (partner.vat ?? "").trim(),
      `odoo_${partnerId}`,
    ].filter(Boolean)));

    const { data: existing } = await sb
      .from("collection_items")
      .select("id, payment_token, amount_usd, status, metadata, expires_at")
      .in("customer_cedula_rif", lookupCedulas)
      .in("status", ["pending", "sent", "viewed"])
      .order("created_at", { ascending: false })
      .limit(1);

    // Solo reusar items NO expirados. La expiración por default es 30 días
    // (migración 004); un item viejo que sigue pending/sent/viewed pero ya
    // venció NO debe reusarse — sino el cliente recibe un token muerto y ve
    // "Este enlace de pago ha expirado" (incidente 2026-06-27). Si está
    // vencido, se ignora y se crea uno fresco más abajo.
    const reuseItem = existing && existing[0]
      && !(existing[0].expires_at && new Date(existing[0].expires_at as string) < new Date())
      ? existing[0] : null;

    if (reuseItem) {
      const item = reuseItem;
      const existingMeta = (item.metadata ?? {}) as Record<string, unknown>;
      // Refrescar metadata si los drafts cambiaron
      const newIdsSorted = [...odooInvoiceIds].sort((a, b) => a - b);
      const oldIds = Array.isArray(existingMeta.odoo_invoice_ids)
        ? (existingMeta.odoo_invoice_ids as number[]).slice().sort((a, b) => a - b)
        : null;
      const idsChanged = !oldIds || JSON.stringify(oldIds) !== JSON.stringify(newIdsSorted);
      const amountChanged = Math.abs(Number(item.amount_usd) - netDue) > 0.01;
      // Refrescar también si cambió el set de residuales (solo con flag on).
      const newResidualIds = postedResiduals.map((r) => r.id).sort((a, b) => a - b);
      const oldResidualIds = Array.isArray(existingMeta.odoo_posted_residual_ids)
        ? (existingMeta.odoo_posted_residual_ids as number[]).slice().sort((a, b) => a - b)
        : [];
      // M1 (review): refrescar también si cambió el MONTO del residual (cobro
      // parcial en caja con el mismo ID) — sino el cliente paga el Bs congelado viejo.
      const oldResidualTotal = Number(existingMeta.posted_residual_total_bs || 0);
      const residualsChanged = saldoAnteriorEnabled && (
        JSON.stringify(oldResidualIds) !== JSON.stringify(newResidualIds)
        || Math.abs(oldResidualTotal - postedResidualTotalBs) > 0.01
      );
      if (idsChanged || amountChanged || residualsChanged) {
        await sb.from("collection_items").update({
          amount_usd: netDue,
          // M1-followup (review): si cambió el residual, invalidar el amount_bss
          // congelado → el próximo GET /pagar/[token] lo re-congela inclusivo con
          // el residual FRESCO (sino B1 inflaría el banco en transferencia+anticipo).
          ...(residualsChanged ? { amount_bss: null, bcv_rate: null } : {}),
          metadata: {
            ...existingMeta,
            odoo_invoice_ids: newIdsSorted,
            odoo_invoice_amounts_usd: odooInvoiceAmountsUsd,
            // Refrescar el detalle visible junto con los IDs.
            odoo_invoices: odooInvoicesMeta,
            is_pay_all: true,
            shortlink_code: code,
            // Saldo anterior (flag on): {} cuando off → no altera el metadata.
            ...postedResidualMeta,
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

    // 6. Crear el collection_item (odooInvoicesMeta ya construido arriba con servicios)
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
          // Saldo anterior (flag on): {} cuando off → no altera el metadata.
          ...postedResidualMeta,
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
