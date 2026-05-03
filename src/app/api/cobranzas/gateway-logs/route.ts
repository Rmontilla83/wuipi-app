// GET /api/cobranzas/gateway-logs
// Lista de eventos de pasarelas (payment_gateway_logs) con KPIs por gateway
// y filtros. Solo administrativos via requirePermission.
//
// Filtros:
//   - gateway, gateway_product
//   - outcome: success | error | pending
//   - error_category
//   - event_type
//   - from / to (created_at)
//   - search (payment_token, customer_name, response_code, response_message)
//   - limit (default 100, max 500)

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const gateway = searchParams.get("gateway") || "";
    const gatewayProduct = searchParams.get("gateway_product") || "";
    const outcome = searchParams.get("outcome") || "";
    const errorCategory = searchParams.get("error_category") || "";
    const eventType = searchParams.get("event_type") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

    const sb = createAdminSupabase();
    let query = sb
      .from("payment_gateway_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (gateway && gateway !== "all") query = query.eq("gateway", gateway);
    if (gatewayProduct) query = query.eq("gateway_product", gatewayProduct);
    if (outcome && outcome !== "all") query = query.eq("outcome", outcome);
    if (errorCategory) query = query.eq("error_category", errorCategory);
    if (eventType) query = query.eq("event_type", eventType);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", `${to}T23:59:59`);
    if (search) {
      const q = search.replace(/[%_]/g, "");
      query = query.or(
        `payment_token.ilike.%${q}%,customer_name.ilike.%${q}%,response_code.ilike.%${q}%,response_message.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const items = data || [];

    // KPIs: tasa exito por gateway (ultimas 24h)
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent24h } = await sb
      .from("payment_gateway_logs")
      .select("gateway, outcome")
      .gte("created_at", since24h);

    const successRateByGateway: Record<string, { total: number; success: number; rate: number }> = {};
    for (const row of recent24h || []) {
      const g = row.gateway || "unknown";
      if (!successRateByGateway[g]) successRateByGateway[g] = { total: 0, success: 0, rate: 0 };
      successRateByGateway[g].total++;
      if (row.outcome === "success") successRateByGateway[g].success++;
    }
    for (const g of Object.keys(successRateByGateway)) {
      const v = successRateByGateway[g];
      v.rate = v.total > 0 ? Math.round((v.success / v.total) * 1000) / 10 : 0;
    }

    // Top errores por categoria (ultimos 7 dias)
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: recent7d } = await sb
      .from("payment_gateway_logs")
      .select("error_category")
      .eq("outcome", "error")
      .gte("created_at", since7d)
      .not("error_category", "is", null);

    const errorTops: Record<string, number> = {};
    for (const row of recent7d || []) {
      const cat = row.error_category || "unknown";
      errorTops[cat] = (errorTops[cat] || 0) + 1;
    }
    const topErrors = Object.entries(errorTops)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return apiSuccess({
      items,
      total_returned: items.length,
      kpis: {
        success_rate_24h: Object.entries(successRateByGateway)
          .map(([gateway, v]) => ({ gateway, ...v }))
          .sort((a, b) => b.total - a.total),
        top_errors_7d: topErrors,
      },
    });
  } catch (err) {
    return apiServerError(err);
  }
}
