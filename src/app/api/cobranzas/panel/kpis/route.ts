// GET /api/cobranzas/panel/kpis
//
// 4 KPIs del header del panel de Cobranzas:
//   - Cobrado USD del período + delta vs período anterior
//   - Tasa de éxito (paid / intentos del período)
//   - Fallos del período + razón #1
//   - Pendientes/colgados sin resolver (manual_review + huérfanos sin cola)
//
// Solo lectura. Acceso: cobranzas:read.

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiServerError, apiSuccess } from "@/lib/api-helpers";
import { rangeForPeriod, previousRange, type Period } from "@/lib/cobranzas/period-helpers";
import type { Kpis } from "@/lib/cobranzas/types";

function parsePeriod(value: string | null): Period {
  if (value === "hoy" || value === "7d" || value === "30d" || value === "mes" || value === "custom") {
    return value;
  }
  return "hoy";
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("No autorizado", 401);

    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("period"));
    const range = rangeForPeriod(period, sp.get("from"), sp.get("to"));
    const prev = previousRange(range);

    const db = createAdminSupabase();

    // Fechas para huérfanos: miramos un horizonte fijo de 90 días hacia atrás
    // (no el período seleccionado) porque un paid sin cola puede venir de
    // hace tiempo y queremos contabilizarlo igual.
    const orphansHorizonFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [
      paidCurrent,
      paidPrev,
      intentsCurrent,
      intentsPrev,
      failedCurrent,
      manualReview,
      paidIdsForOrphans,
      queueIdsForOrphans,
    ] = await Promise.all([
      // Cobrado USD período actual
      db
        .from("collection_items")
        .select("amount_usd, amount_bss")
        .eq("status", "paid")
        .gte("paid_at", range.from)
        .lt("paid_at", range.to),

      // Cobrado USD período anterior
      db
        .from("collection_items")
        .select("amount_usd")
        .eq("status", "paid")
        .gte("paid_at", prev.from)
        .lt("paid_at", prev.to),

      // Total de items creados en el período (denominador de tasa)
      db
        .from("collection_items")
        .select("id, status", { count: "exact", head: false })
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .in("status", ["paid", "failed", "expired"]),

      db
        .from("collection_items")
        .select("id, status", { count: "exact", head: false })
        .gte("created_at", prev.from)
        .lt("created_at", prev.to)
        .in("status", ["paid", "failed", "expired"]),

      // Fallidos del período (para # y razón top)
      db
        .from("collection_items")
        .select("id, payment_method")
        .eq("status", "failed")
        .gte("created_at", range.from)
        .lt("created_at", range.to),

      // Items en manual_review (deuda técnica, no acotado a período)
      db
        .from("odoo_sync_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "manual_review")
        .eq("resolved_manually", false),

      // IDs de items paid en los últimos 90 días (para cruzar con la cola)
      db
        .from("collection_items")
        .select("id")
        .eq("status", "paid")
        .gte("paid_at", orphansHorizonFrom),

      // IDs de items que SÍ están en la cola de sync (para excluir del cruce)
      db.from("odoo_sync_queue").select("collection_item_id"),
    ]);

    if (paidCurrent.error) console.error("[kpis] paidCurrent:", paidCurrent.error);
    if (paidPrev.error) console.error("[kpis] paidPrev:", paidPrev.error);
    if (paidIdsForOrphans.error) console.error("[kpis] paidIdsForOrphans:", paidIdsForOrphans.error);
    if (queueIdsForOrphans.error) console.error("[kpis] queueIdsForOrphans:", queueIdsForOrphans.error);

    const cobradoUsd = (paidCurrent.data || []).reduce(
      (acc, r) => acc + (Number(r.amount_usd) || 0),
      0,
    );
    const cobradoBss = (paidCurrent.data || []).reduce(
      (acc, r) => acc + (Number(r.amount_bss) || 0),
      0,
    );
    const cobradoUsdPrev = (paidPrev.data || []).reduce(
      (acc, r) => acc + (Number(r.amount_usd) || 0),
      0,
    );

    const intentsCurr = intentsCurrent.data || [];
    const intentsCount = intentsCurrent.count ?? intentsCurr.length;
    const paidCount = intentsCurr.filter((r) => r.status === "paid").length;
    const successRate = intentsCount > 0 ? (paidCount / intentsCount) * 100 : 0;

    const intentsP = intentsPrev.data || [];
    const intentsPCount = intentsPrev.count ?? intentsP.length;
    const paidPCount = intentsP.filter((r) => r.status === "paid").length;
    const successRatePrev = intentsPCount > 0 ? (paidPCount / intentsPCount) * 100 : 0;

    const failedRows = failedCurrent.data || [];
    const failedCount = failedRows.length;
    let failedTopReason: string | null = null;
    if (failedRows.length > 0) {
      const byMethod: Record<string, number> = {};
      for (const r of failedRows) {
        const k = r.payment_method || "desconocido";
        byMethod[k] = (byMethod[k] || 0) + 1;
      }
      const top = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const labels: Record<string, string> = {
          debito_inmediato: "Mercantil Débito",
          c2p: "C2P",
          transferencia: "Transferencia",
          stripe: "Stripe",
          paypal: "PayPal",
        };
        failedTopReason = `${labels[top[0]] || top[0]} (${top[1]})`;
      }
    }

    // Huérfanos reales: paid en los últimos 90d que NO aparecen en odoo_sync_queue.
    const idsInQueue = new Set(
      (queueIdsForOrphans.data || [])
        .map((r) => r.collection_item_id)
        .filter((x): x is string => !!x),
    );
    const orphansCount = (paidIdsForOrphans.data || []).filter((r) => !idsInQueue.has(r.id)).length;

    const pendingCount = (manualReview.count || 0) + orphansCount;

    const result: Kpis = {
      cobradoUsd,
      cobradoUsdPrev,
      cobradoBss,
      successRate,
      successRatePrev,
      failedCount,
      failedTopReason,
      pendingCount,
    };

    return apiSuccess(result);
  } catch (err) {
    return apiServerError(err);
  }
}
