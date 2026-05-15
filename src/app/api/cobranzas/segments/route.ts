// GET /api/cobranzas/segments — lista segmentos (default solo no-archivados)
// POST /api/cobranzas/segments — crear segmento
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { listSegments, createSegment } from "@/lib/dal/collection-segments";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);
    const { searchParams } = request.nextUrl;
    const includeArchived = searchParams.get("include_archived") === "true";
    const segments = await listSegments({ includeArchived });
    return apiSuccess({ segments });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "create");
    if (!caller) return apiError("Sin permisos", 403);
    const body = await request.json();

    const name = (body.name || "").toString().trim();
    if (!name) return apiError("El nombre es obligatorio", 400);
    if (name.length > 200) return apiError("Nombre máximo 200 caracteres", 400);

    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const description = body.description ? String(body.description).slice(0, 1000) : null;
    const excludeRecentDays = Number.isInteger(body.exclude_recent_days) && body.exclude_recent_days >= 0
      ? body.exclude_recent_days
      : 0;

    const segment = await createSegment({
      name,
      description,
      filters,
      exclude_recent_days: excludeRecentDays,
      created_by: caller.id,
    });
    return apiSuccess({ segment });
  } catch (error) {
    return apiServerError(error);
  }
}
