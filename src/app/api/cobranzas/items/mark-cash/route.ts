// POST /api/cobranzas/items/mark-cash
// Admin registers a cash payment made at the office (Puerto La Cruz, Lecheria).
// Marks the item as paid + persists cash details in metadata + notifies client.
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { validate, markCashSchema } from "@/lib/validations/schemas";
import { createAdminSupabase } from "@/lib/supabase/server";
import { updateCampaignTotals } from "@/lib/dal/collection-campaigns";
import { fetchBCVRate } from "@/lib/integrations/bcv";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

// Allowed tolerance between what the item asks vs what the client paid,
// evaluated on the USD-equivalent. ±5% covers BCV rate fluctuations and
// rounding; anything beyond needs an explicit note.
const AMOUNT_TOLERANCE = 0.05;

const LOCATION_LABEL: Record<string, string> = {
  PLC: "Puerto La Cruz",
  Lecheria: "Lechería",
  Other: "Otro",
};

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "update");
    if (!caller) return apiError("Sin permisos", 403);

    const body = await request.json();
    const parsed = validate(markCashSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { item_id, paid_currency, paid_amount, location, notes } = parsed.data;

    const sb = createAdminSupabase();
    const { data: item, error: fetchErr } = await sb
      .from("collection_items")
      .select("*")
      .eq("id", item_id)
      .single();
    if (fetchErr || !item) return apiError("Cobro no encontrado", 404);

    if (item.status === "paid") {
      return apiError("Este cobro ya está marcado como pagado", 400);
    }
    if (!["pending", "sent", "viewed", "conciliating"].includes(item.status)) {
      return apiError(`No se puede marcar cash en estado ${item.status}`, 400);
    }

    // Compute USD equivalent of what was paid, to compare against expected.
    let paidUsd = paid_amount;
    let bcvRate: number | null = null;
    if (paid_currency === "VES") {
      try {
        const bcv = await fetchBCVRate();
        bcvRate = bcv.usd_to_bs;
        paidUsd = paid_amount / bcv.usd_to_bs;
      } catch {
        return apiError(
          "No se pudo obtener la tasa BCV para convertir. Reintenta en un momento.",
          503
        );
      }
    }

    const expectedUsd = Number(item.amount_usd);
    const diffPct = Math.abs(paidUsd - expectedUsd) / expectedUsd;

    // If the paid amount deviates more than AMOUNT_TOLERANCE from expected,
    // require a justification note — protects against honest mistakes.
    if (diffPct > AMOUNT_TOLERANCE && !notes) {
      return apiError(
        `Diferencia mayor a ${(AMOUNT_TOLERANCE * 100).toFixed(0)}% — agregá una nota explicando el motivo. ` +
        `Esperado: $${expectedUsd.toFixed(2)} · Pagado (USD equiv): $${paidUsd.toFixed(2)}`,
        400
      );
    }

    const now = new Date().toISOString();
    const currencyLabel = paid_currency === "VES" ? "Bs" : "USD";
    const locLabel = LOCATION_LABEL[location] || location;
    const paymentReference = `CASH-${location}-${currencyLabel}${paid_amount.toFixed(2)}`;

    const mergedMetadata = {
      ...(item.metadata || {}),
      cash: {
        paid_currency,
        paid_amount,
        paid_usd_equivalent: Math.round(paidUsd * 100) / 100,
        bcv_rate: bcvRate,
        location,
        location_label: locLabel,
        notes: notes || null,
        paid_by_user_id: caller.id,
        paid_by_email: caller.email,
        recorded_at: now,
      },
    };

    const { error: updateErr } = await sb
      .from("collection_items")
      .update({
        status: "paid",
        payment_method: "cash",
        payment_reference: paymentReference,
        paid_at: now,
        payment_date: now,
        ...(paid_currency === "VES"
          ? { amount_bss: paid_amount, bcv_rate: bcvRate }
          : {}),
        metadata: mergedMetadata,
      })
      .eq("id", item_id);
    if (updateErr) return apiError(`Error al actualizar: ${updateErr.message}`, 500);

    // Update campaign totals (async, non-blocking if it fails)
    if (item.campaign_id) {
      updateCampaignTotals(item.campaign_id).catch(err =>
        console.error("[mark-cash] updateCampaignTotals:", err)
      );
    }

    // Send confirmations (fire-and-forget) — cash is verified at the till,
    // so "pago recibido" is the correct message here.
    const amountMsg = paid_currency === "VES"
      ? `Bs ${paid_amount.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
      : `$${paid_amount.toFixed(2)} USD`;
    const concept = item.concept || "Servicio WUIPI";

    if (item.customer_phone) {
      sendPaymentConfirmationWhatsApp({
        phone: item.customer_phone,
        customerName: item.customer_name,
        reference: paymentReference,
        amount: amountMsg,
        concept,
      }).catch((err) => console.error("[mark-cash] WA error:", err));
    }

    if (item.customer_email) {
      sendPaymentConfirmationEmail({
        email: item.customer_email,
        customerName: item.customer_name,
        reference: paymentReference,
        amount: amountMsg,
        concept,
      }).catch((err) => console.error("[mark-cash] Email error:", err));
    }

    return apiSuccess({
      status: "paid",
      payment_method: "cash",
      payment_reference: paymentReference,
      paid_usd_equivalent: Math.round(paidUsd * 100) / 100,
      diff_pct: Math.round(diffPct * 10000) / 100, // e.g. 2.35 → 2.35%
    });
  } catch (error) {
    return apiServerError(error);
  }
}
