// GET /api/cobranzas/[token] — Obtiene datos del item por token (para el portal público)
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { getItemsByToken, updateItem } from "@/lib/dal/collection-campaigns";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Rate limit: 30 requests per minute per IP
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`token:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    // Validate token format
    if (!/^wpy_[a-f0-9]{16,64}$/.test(params.token)) {
      return apiError("Enlace de pago no válido", 400);
    }

    const item = await getItemsByToken(params.token);
    if (!item) {
      return apiError("Enlace de pago no encontrado o expirado", 404);
    }

    // Enforce expiration
    if (item.expires_at && new Date(item.expires_at) < new Date()) {
      return apiError("Este enlace de pago ha expirado", 410);
    }

    // Mark as viewed if still pending/sent, and persist the Bs amount
    // at the BCV rate of the first view. This "freezes" the expected amount
    // so later Mercantil transfer-search can match the exact Bs that the
    // client saw and transferred. The UI recalculates Bs client-side via
    // /api/cobranzas/bcv for display, but the authoritative figure for
    // verification lives on the item.
    if (item.status === "pending" || item.status === "sent") {
      const update: Record<string, unknown> = { status: "viewed" };
      if (!item.amount_bss) {
        try {
          const bcv = await fetchBCVRate();
          update.amount_bss = convertUsdToBs(Number(item.amount_usd), bcv.usd_to_bs);
          update.bcv_rate = bcv.usd_to_bs;
          item.amount_bss = update.amount_bss as number;
          item.bcv_rate = update.bcv_rate as number;
        } catch {
          // BCV hiccup — don't block the portal load; fallback calc happens on confirm.
        }
      }
      await updateItem(item.id, update);
      item.status = "viewed";
    }

    // Extract safe metadata for public display (invoice details only)
    const odooInvoices = item.metadata?.odoo_invoices || null;

    // Return only safe public fields
    return apiSuccess({
      token: item.payment_token,
      customer_name: item.customer_name,
      invoice_number: item.invoice_number,
      concept: item.concept,
      amount_usd: item.amount_usd,
      status: item.status,
      payment_method: item.payment_method,
      payment_reference: item.payment_reference,
      paid_at: item.paid_at,
      ...(odooInvoices ? { odoo_invoices: odooInvoices, currency: item.metadata?.currency } : {}),
    });
  } catch (error) {
    return apiServerError(error);
  }
}
