// GET /api/cobranzas/external-payments
//
// Lista pagos recibidos por el banco que NO se asociaron a un item de
// cobranza (sin invoice_number). Casi siempre son pagos móviles directos
// al número Wuipi o transferencias que el cliente hizo fuera de nuestro
// portal. Finanzas los concilia manualmente en Odoo.
//
// Marcados como `external_unmatched` en payment_webhook_logs.processing_error
// (ver /api/mercantil branch 2026-05-13).
//
// Decisión usuario 2026-05-04: solo visibilidad, NO acción automática.
// El cron C1a (polling Odoo) cerrará casos en kanban cuando finanzas lo
// registre del lado Odoo.
//
// Permisos: cobranzas:read (super_admin/admin/finanzas/gerente).
//
// Query params:
//   - limit (default 100, max 500)
//   - method (filtra payment_method: "PAGO MOVIL" | "TRANSFERENCIA" | ...)
//   - since (ISO date — default últimos 30 días)

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
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 500);
    const methodFilter = searchParams.get("method");
    const sinceParam = searchParams.get("since");
    const since = sinceParam
      ? new Date(sinceParam)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // últimos 30 días por default

    const sb = createAdminSupabase();
    let query = sb
      .from("payment_webhook_logs")
      .select("id, received_at, payment_method, reference_number, amount, status, invoice_number, processing_error, raw_payload")
      .like("processing_error", "external_unmatched%")
      .gte("received_at", since.toISOString())
      .order("received_at", { ascending: false })
      .limit(limit);

    if (methodFilter) {
      query = query.eq("payment_method", methodFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Stats agregadas para el header del sub-panel
    const { data: stats } = await sb
      .from("payment_webhook_logs")
      .select("payment_method, amount")
      .like("processing_error", "external_unmatched%")
      .gte("received_at", since.toISOString());

    const byMethod: Record<string, { count: number; totalBs: number }> = {};
    let totalCount = 0;
    let totalBs = 0;
    for (const s of stats || []) {
      totalCount++;
      const m = s.payment_method || "unknown";
      if (!byMethod[m]) byMethod[m] = { count: 0, totalBs: 0 };
      byMethod[m].count++;
      const amt = Number(s.amount) || 0;
      byMethod[m].totalBs += amt;
      totalBs += amt;
    }

    return apiSuccess({
      items: data || [],
      stats: {
        total_count: totalCount,
        total_bs: Math.round(totalBs * 100) / 100,
        by_method: byMethod,
        since: since.toISOString(),
      },
    });
  } catch (err) {
    return apiServerError(err);
  }
}
