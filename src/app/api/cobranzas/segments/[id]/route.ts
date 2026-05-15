// GET    /api/cobranzas/segments/[id] — leer segmento individual
// PUT    /api/cobranzas/segments/[id] — actualizar (name, description, filters, exclude_recent_days, is_archived)
// DELETE /api/cobranzas/segments/[id] — borrar (las campañas previas mantienen snapshot_filters)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { getSegment, updateSegment, deleteSegment } from "@/lib/dal/collection-segments";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);
    const segment = await getSegment(params.id);
    if (!segment) return apiError("Segmento no encontrado", 404);
    return apiSuccess({ segment });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("cobranzas", "update");
    if (!caller) return apiError("Sin permisos", 403);
    const body = await request.json();

    const updates: Parameters<typeof updateSegment>[1] = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return apiError("Nombre vacío", 400);
      if (name.length > 200) return apiError("Nombre máximo 200 chars", 400);
      updates.name = name;
    }
    if ("description" in body) {
      updates.description = body.description ? String(body.description).slice(0, 1000) : null;
    }
    if (body.filters && typeof body.filters === "object") {
      updates.filters = body.filters;
    }
    if (Number.isInteger(body.exclude_recent_days) && body.exclude_recent_days >= 0) {
      updates.exclude_recent_days = body.exclude_recent_days;
    }
    if (typeof body.is_archived === "boolean") {
      updates.is_archived = body.is_archived;
    }

    if (Object.keys(updates).length === 0) {
      return apiError("Sin cambios para aplicar", 400);
    }

    const segment = await updateSegment(params.id, updates);
    return apiSuccess({ segment });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("cobranzas", "delete");
    if (!caller) return apiError("Sin permisos", 403);
    await deleteSegment(params.id);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiServerError(error);
  }
}
