// POST /api/cobranzas/segments/preview
//
// Ejecuta los filtros contra Odoo en vivo y devuelve count + total_usd + sample.
// Acepta filtros inline (sin guardar el segmento) o un segment_id existente.
//
// Body:
//  - { segment_id: string }                    → carga del DB y ejecuta
//  - { filters: SegmentFilters, exclude_recent_days?: number }
//                                              → ejecución one-off (no guarda)
//  - { segment_id, override_filters }           → carga + override + NO actualiza cache
//
// Response: { count, total_usd, sample, partner_ids, excluded_recent_count, executed_at }

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { previewSegment } from "@/lib/integrations/odoo-collection-segments";
import {
  getSegment,
  updateSegmentPreviewCache,
  findRecentlyContactedPartners,
} from "@/lib/dal/collection-segments";

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const body = await request.json().catch(() => ({}));

    let filters = body.filters && typeof body.filters === "object" ? body.filters : null;
    let excludeRecentDays =
      Number.isInteger(body.exclude_recent_days) && body.exclude_recent_days >= 0
        ? body.exclude_recent_days
        : 0;
    let segmentIdToCache: string | null = null;

    // Si trae segment_id, cargamos del DB
    if (body.segment_id) {
      const seg = await getSegment(String(body.segment_id));
      if (!seg) return apiError("Segmento no encontrado", 404);
      filters = seg.filters;
      excludeRecentDays = seg.exclude_recent_days;
      segmentIdToCache = seg.id;
      // Si el caller pasa override_filters, lo aplicamos pero NO actualizamos
      // el cache del segmento (es un preview ad-hoc).
      if (body.override_filters && typeof body.override_filters === "object") {
        filters = { ...filters, ...body.override_filters };
        segmentIdToCache = null;
      }
    }

    if (!filters) {
      return apiError("Faltan filtros — pasá `filters` o `segment_id`", 400);
    }

    // Anti-spam: traer partners contactados recientemente desde Supabase
    const excludeRecent = excludeRecentDays > 0
      ? await findRecentlyContactedPartners(excludeRecentDays)
      : [];

    const result = await previewSegment({
      filters,
      excludePartnerIdsFromRecent: excludeRecent,
      sampleSize: Number.isInteger(body.sample_size) && body.sample_size > 0 && body.sample_size <= 100
        ? body.sample_size
        : 20,
    });

    // Persistir cache solo si el preview fue de un segmento guardado sin overrides
    if (segmentIdToCache) {
      await updateSegmentPreviewCache(segmentIdToCache, result.count, result.total_usd)
        .catch((err) => console.error("[segments/preview] cache update fallo:", err));
    }

    return apiSuccess({
      ...result,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    return apiServerError(error);
  }
}
