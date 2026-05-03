// GET /api/cobranzas/payments-received
// Lista de pagos confirmados (collection_items con status='paid') + KPIs.
// Reemplaza el viejo /api/facturacion/payments para el tab "Pagos Recibidos".
//
// Filtros aceptados:
//   - method: debito_inmediato | c2p | transferencia | cash | stripe | paypal
//   - from / to: rango de fechas (paid_at)
//   - search: nombre cliente, cedula, referencia, payment_token
//   - limit (default 50, max 200)

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";

interface PaymentRow {
  id: string;
  payment_token: string;
  customer_name: string;
  customer_cedula_rif: string;
  customer_phone: string | null;
  customer_email: string | null;
  invoice_number: string | null;
  amount_usd: number;
  amount_bss: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string;
  campaign_id: string | null;
  bcv_rate: number | null;
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const method = searchParams.get("method") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const sb = createAdminSupabase();
    let query = sb
      .from("collection_items")
      .select("id, payment_token, customer_name, customer_cedula_rif, customer_phone, customer_email, invoice_number, amount_usd, amount_bss, payment_method, payment_reference, paid_at, campaign_id, bcv_rate")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(limit);

    if (method && method !== "all") {
      // 'cash' cubre cash_ves y cash_usd que se almacenan ambos como 'cash'
      query = query.eq("payment_method", method);
    }
    if (from) query = query.gte("paid_at", from);
    if (to) query = query.lte("paid_at", `${to}T23:59:59`);
    if (search) {
      const q = search.replace(/[%_]/g, "");
      query = query.or(
        `customer_name.ilike.%${q}%,customer_cedula_rif.ilike.%${q}%,payment_reference.ilike.%${q}%,payment_token.ilike.%${q}%,invoice_number.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const items = (data || []) as PaymentRow[];

    // KPIs: cobrado hoy / semana / mes (USD equivalente)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let todayUsd = 0, weekUsd = 0, monthUsd = 0;
    const byMethod: Record<string, { count: number; amount_usd: number }> = {};
    for (const it of items) {
      const ts = it.paid_at ? new Date(it.paid_at).getTime() : 0;
      const usd = Number(it.amount_usd || 0);
      if (ts >= monthStart) monthUsd += usd;
      if (ts >= weekStart) weekUsd += usd;
      if (ts >= todayStart) todayUsd += usd;
      const m = it.payment_method || "unknown";
      if (!byMethod[m]) byMethod[m] = { count: 0, amount_usd: 0 };
      byMethod[m].count++;
      byMethod[m].amount_usd += usd;
    }

    return apiSuccess({
      items,
      total_returned: items.length,
      kpis: {
        today_usd: Math.round(todayUsd * 100) / 100,
        week_usd: Math.round(weekUsd * 100) / 100,
        month_usd: Math.round(monthUsd * 100) / 100,
        by_method: Object.entries(byMethod).map(([method, v]) => ({
          method,
          count: v.count,
          amount_usd: Math.round(v.amount_usd * 100) / 100,
        })).sort((a, b) => b.amount_usd - a.amount_usd),
      },
    });
  } catch (err) {
    return apiServerError(err);
  }
}
