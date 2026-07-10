import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { verifyClientPaymentToken } from "@/lib/utils/payment-token";
import { isConfigured, getPartner, listInvoices, getInvoiceProductsByMove, listPostedResidualsForPartner, type PostedResidual } from "@/lib/integrations/odoo-new";
import { createAdminSupabase } from "@/lib/supabase/server";
import { generateCollectionToken } from "@/lib/dal/collection-campaigns";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { normalizeOdooVatToCedula } from "@/lib/utils/cedula";
import { isSaldoAnteriorEnabledForPartner } from "@/lib/cobranzas/saldo-anterior";

export const dynamic = "force-dynamic";

const PORTAL_CAMPAIGN_NAME = "Portal Autoservicio";

/**
 * POST /api/pagar/cliente/iniciar
 * Body: { token: string, invoice_ids?: number[] }
 * Creates or reuses a collection_item for the client's current debt.
 * Returns the wpy_ payment token to redirect to /pagar/[token].
 *
 * Lee partner e invoices DEL NUEVO ODOO (erp.wuipi.net).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`pagar-iniciar:${ip}`, 10, 60_000);
    if (!rl.allowed) return apiError("Demasiadas solicitudes", 429);

    if (!isConfigured()) return apiError("Sistema no disponible", 503);

    const body = await request.json();
    const { token, invoice_ids } = body as { token?: string; invoice_ids?: number[] };
    if (!token || typeof token !== "string" || token.length > 100) {
      return apiError("Token requerido", 400);
    }

    const partnerId = verifyClientPaymentToken(token);
    if (!partnerId) return apiError("Token no valido", 400);

    // Get client info — `is_company` se necesita para inferir la letra del
    // documento (J vs V) cuando partner.vat viene sin prefijo desde Odoo.
    const partner = await getPartner(partnerId);
    if (!partner) return apiError("Cliente no encontrado", 404);

    // Normaliza la cédula/RIF al formato exacto que Mercantil exige en
    // transfer-search (V/J/G/E/P + dígitos).
    const cedulaRif = normalizeOdooVatToCedula(partner.vat, partner.isCompany, partnerId);

    // Get current draft invoices (cuentas por cobrar)
    const { items: drafts } = await listInvoices({
      partnerId,
      states: ["draft"],
      limit: 50,
      order: "invoice_date_due asc",
    });

    // Filtra a invoice_ids específicos si vienen en el body.
    let selectedDrafts = drafts;
    if (Array.isArray(invoice_ids) && invoice_ids.length > 0) {
      const ids = invoice_ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
      const draftIds = new Set(drafts.map((d) => d.id));
      const invalidIds = ids.filter(id => !draftIds.has(id));
      if (invalidIds.length > 0) {
        return apiError(`Facturas no validas: ${invalidIds.join(", ")}`, 400);
      }
      selectedDrafts = drafts.filter((d) => ids.includes(d.id));
    }

    const selectedTotal = selectedDrafts.reduce((s, d) => s + d.amountTotal, 0);
    const draftTotalAll = drafts.reduce((s, d) => s + d.amountTotal, 0);

    // El crédito a favor solo se aplica cuando se paga TODO. En pago parcial
    // no se aplica para evitar inconsistencias.
    const isPayAll = !invoice_ids || invoice_ids.length === 0 || selectedDrafts.length === drafts.length;
    // Saldo a favor (anticipo, cta 2105007): fuente autoritativa = helper Odoo,
    // NO la tasa vieja hardcodeada /474 (incidente 2026-06-30). Solo en pago-todo.
    // Si el helper falla, NO descontar (cobra el total; el anticipo se aplica en
    // Odoo al sincronizar) — preferible cobrar de más que de menos.
    let creditFavorUsd = 0;
    if (isPayAll) {
      try {
        const { getPartnerAnticipo } = await import("@/lib/integrations/odoo");
        const anticipo = await getPartnerAnticipo(partnerId);
        creditFavorUsd = anticipo.has_anticipo ? anticipo.usd : 0;
      } catch (err) {
        console.warn("[pagar/cliente/iniciar] getPartnerAnticipo fallo:", err);
      }
    }
    const netDue = Math.round(Math.max(selectedTotal - creditFavorUsd, 0) * 100) / 100;

    if (netDue <= 0) return apiError("No hay saldo pendiente", 400);

    // ── Fase 1 — SALDO ANTERIOR (flag PORTAL_SALDO_ANTERIOR_ENABLED) ──────────
    // Facturas YA posteadas con residual (típ. cobro incompleto en caja) que el
    // portal no mostraba. Aditivo y gateado: con el flag OFF, postedResidualMeta
    // = {} → metadata y comportamiento byte-idénticos al actual. El residual solo
    // "viaja" cuando hay al menos un draft (sin drafts netDue<=0 y ya retornamos)
    // — consistente con la decisión §8.4: no se cobran residuales sueltos, se
    // barren cuando una factura nueva los acompaña.
    const saldoAnteriorEnabled = isSaldoAnteriorEnabledForPartner(partnerId);
    let postedResiduals: PostedResidual[] = [];
    if (saldoAnteriorEnabled) {
      try {
        postedResiduals = await listPostedResidualsForPartner(partnerId);
      } catch (err) {
        console.warn("[pagar/cliente/iniciar] listPostedResidualsForPartner fallo:", err);
      }
    }
    const postedResidualsBs: Record<number, number> = {};
    let postedResidualTotalBs = 0;
    for (const r of postedResiduals) {
      postedResidualsBs[r.id] = r.residualBs;
      postedResidualTotalBs += r.residualBs;
    }
    postedResidualTotalBs = Math.round(postedResidualTotalBs * 100) / 100;
    // Bloque de metadata del saldo anterior. VACÍO cuando el flag está off → no
    // altera el metadata (byte-idéntico). Se mezcla al crear y al reusar el item.
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

    const sb = createAdminSupabase();

    // Reusa item existente SOLO en el caso "pago todo" (sin invoice_ids).
    // Si el cliente pide invoice_ids especificos, siempre crea un item nuevo
    // para no mezclar selecciones distintas.
    const odooInvoiceAmountsUsd: Record<number, number> = {};
    for (const d of selectedDrafts) {
      odooInvoiceAmountsUsd[d.id] = d.amountTotal;
    }

    // Detalle de facturas que ve el cliente (number + servicio + monto).
    // Se construye UNA vez y se usa tanto al crear como al reusar el item, así
    // el display nunca queda desfasado cuando los drafts del partner cambian
    // (bug 2026-06-03: el reuse refrescaba IDs/monto pero no este array).
    // `products` se puebla con los servicios reales del draft (account.move.line).
    const productsByMove = await getInvoiceProductsByMove(selectedDrafts.map((d) => d.id));
    const odooInvoices = selectedDrafts.map((d) => ({
      number: d.name,
      date: d.invoiceDate || "",
      due_date: d.invoiceDateDue || "",
      total: d.amountTotal,
      amount_due: d.amountTotal,
      currency: d.currencyCode || "USD",
      products: productsByMove.get(d.id) ?? [],
    }));

    if (isPayAll) {
      // Busca items abiertos que pertenezcan a este partner por cédula.
      const lookupCedulas = Array.from(new Set([
        cedulaRif,
        (partner.vat ?? "").trim(),
        `odoo_${partnerId}`,
      ].filter(Boolean)));
      const { data: existing } = await sb
        .from("collection_items")
        .select("id, payment_token, amount_usd, status, metadata, customer_cedula_rif, expires_at")
        .in("customer_cedula_rif", lookupCedulas)
        .in("status", ["pending", "sent", "viewed"])
        .order("created_at", { ascending: false })
        .limit(1);

      const existingMeta = existing && existing.length > 0
        ? (existing[0].metadata as Record<string, unknown> | null) : null;
      const wasPayAll = existingMeta
        ? (existingMeta.is_pay_all === true || !existingMeta.odoo_invoice_ids)
        : false;
      // No reusar items expirados (default 30d, migración 004): reusar uno
      // vencido devuelve un token muerto → "Este enlace de pago ha expirado"
      // (incidente 2026-06-27). Si venció, se crea uno fresco más abajo.
      const notExpired = !!(existing && existing[0]
        && !(existing[0].expires_at && new Date(existing[0].expires_at as string) < new Date()));
      const reusable = existing && existing.length > 0 && wasPayAll && notExpired;

      if (reusable) {
        const item = existing[0];
        const itemUpdate: Record<string, unknown> = {};
        if (Math.abs(item.amount_usd - netDue) > 0.01) {
          itemUpdate.amount_usd = netDue;
        }
        if (item.customer_cedula_rif !== cedulaRif) {
          itemUpdate.customer_cedula_rif = cedulaRif;
        }
        const newInvoiceIds = selectedDrafts.map(d => d.id).sort((a, b) => a - b);
        const oldInvoiceIds = Array.isArray(existingMeta?.odoo_invoice_ids)
          ? (existingMeta.odoo_invoice_ids as number[]).slice().sort((a, b) => a - b)
          : null;
        const idsChanged = !oldInvoiceIds || JSON.stringify(oldInvoiceIds) !== JSON.stringify(newInvoiceIds);
        // Refrescar también si cambió el set de residuales (solo con flag on).
        const newResidualIds = postedResiduals.map((r) => r.id).sort((a, b) => a - b);
        const oldResidualIds = Array.isArray(existingMeta?.odoo_posted_residual_ids)
          ? (existingMeta.odoo_posted_residual_ids as number[]).slice().sort((a, b) => a - b)
          : [];
        // M1 (review): refrescar también si cambió el MONTO del residual (misma
        // factura con amount_residual menor por cobro parcial en caja) — sino el
        // cliente pagaría el Bs congelado viejo (sobrecobro).
        const oldResidualTotal = Number((existingMeta as Record<string, unknown> | null)?.posted_residual_total_bs || 0);
        const residualsChanged = saldoAnteriorEnabled && (
          JSON.stringify(oldResidualIds) !== JSON.stringify(newResidualIds)
          || Math.abs(oldResidualTotal - postedResidualTotalBs) > 0.01
        );
        if (idsChanged || residualsChanged) {
          itemUpdate.metadata = {
            ...(existingMeta || {}),
            // Refrescar el partner autoritativo (del token) junto con las facturas.
            // El sync lo prefiere sobre el lookup por email/cédula; si el item se
            // reusó desde otro partner (comparten cédula/email) quedaría STALE.
            odoo_partner_id: partnerId,
            odoo_invoice_ids: newInvoiceIds,
            odoo_invoice_amounts_usd: odooInvoiceAmountsUsd,
            // Refrescar el detalle visible (number/servicio/monto) junto con los
            // IDs — sino el portal muestra datos viejos del draft anterior.
            odoo_invoices: odooInvoices,
            is_pay_all: true,
            // Saldo anterior (flag on): {} cuando off → no altera el metadata.
            ...postedResidualMeta,
          };
        }
        // M1-followup (review): si cambió el residual, invalidar el amount_bss
        // congelado para que el próximo GET /pagar/[token] lo re-congele inclusivo
        // (drafts + residual FRESCO). Sino B1 restaría el residual nuevo de un
        // amount_bss viejo → transferencia+anticipo inflaría el banco.
        if (residualsChanged) {
          itemUpdate.amount_bss = null;
          itemUpdate.bcv_rate = null;
        }
        if (Object.keys(itemUpdate).length > 0) {
          await sb.from("collection_items").update(itemUpdate).eq("id", item.id);
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

    // odoo_invoice_ids: TODAS las facturas seleccionadas. Sin esto, clientes con N
    // drafts pagando "todo" dejaban N-1 facturas en draft post-pago (bug 2026-05-14).
    // `odooInvoices` (detalle con servicios) ya se construyó arriba.
    const odooInvoiceIds = selectedDrafts.map((d) => d.id);

    // Create collection item
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
          odoo_invoices: odooInvoices,
          odoo_invoice_ids: odooInvoiceIds,
          odoo_invoice_amounts_usd: odooInvoiceAmountsUsd,
          draft_total_all: draftTotalAll,
          is_pay_all: isPayAll,
          // Saldo anterior (flag on): {} cuando off → no altera el metadata.
          ...postedResidualMeta,
        },
      });

    if (insertErr) throw insertErr;

    return apiSuccess({ payment_token: paymentToken, amount: netDue });
  } catch (error) {
    return apiServerError(error);
  }
}
