// GET /api/cobranzas/wa-outbox
// Lista de mensajes WA del riel de Cobranzas (cobranzas_wa_outbox).
// Devuelve tambien el modo actual (dry-run vs live) para que la UI muestre
// el indicador grande sin un round-trip extra.
//
// Filtros:
//   - status: queued | dry_run | sent | failed | skipped
//   - trigger_event: payment_failure_case | collection_calendar_d27 | ...
//   - search: customer_name, customer_phone_masked, template_name
//   - limit (default 100, max 500)

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCobranzasWAMode } from "@/lib/cobranzas/wa-cobranzas";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "";
    const triggerEvent = searchParams.get("trigger_event") || "";
    const search = searchParams.get("search") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

    const sb = createAdminSupabase();
    let query = sb
      .from("cobranzas_wa_outbox")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && status !== "all") query = query.eq("status", status);
    if (triggerEvent) query = query.eq("trigger_event", triggerEvent);
    if (search) {
      const q = search.replace(/[%_]/g, "");
      query = query.or(
        `customer_name.ilike.%${q}%,customer_phone_masked.ilike.%${q}%,template_name.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const items = data || [];

    // KPI rapido por status (ultimas 24h)
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent } = await sb
      .from("cobranzas_wa_outbox")
      .select("status")
      .gte("created_at", since24h);

    const statusCounts: Record<string, number> = {};
    for (const r of recent || []) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    return apiSuccess({
      items,
      total_returned: items.length,
      mode: getCobranzasWAMode(),  // 'dry_run' | 'live'
      kpis_24h: statusCounts,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
