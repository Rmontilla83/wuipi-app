export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { getCallerProfile } from "@/lib/auth/check-permission";
import { can } from "@/lib/auth/permissions";
import { getRolePermissions, bulkUpdatePermissions } from "@/lib/dal/permissions";
import { logAudit } from "@/lib/auth/audit";
import type { UserRole } from "@/types";

/**
 * GET /api/configuracion/permisos
 * Returns all role permissions from DB.
 */
export async function GET() {
  try {
    const caller = await getCallerProfile();
    if (!caller) return apiError("No autenticado", 401);
    if (!can(caller.role, "configuracion", "read")) {
      return apiError("Sin permisos", 403);
    }

    const permissions = await getRolePermissions();
    return apiSuccess({ permissions });
  } catch (error) {
    return apiServerError(error);
  }
}

/**
 * PUT /api/configuracion/permisos
 * Bulk update permissions. Only super_admin.
 * Body: { changes: [{ role, module, actions }] }
 */
export async function PUT(req: NextRequest) {
  try {
    const caller = await getCallerProfile();
    if (!caller) return apiError("No autenticado", 401);
    if (caller.role !== "super_admin") {
      return apiError("Solo super_admin puede modificar permisos", 403);
    }

    const body = await req.json();
    const { changes } = body;

    if (!Array.isArray(changes) || changes.length === 0) {
      return apiError("Se requiere un array de cambios");
    }

    // Validate each change
    for (const c of changes) {
      if (!c.role || !c.module || !Array.isArray(c.actions)) {
        return apiError("Cada cambio requiere role, module y actions[]");
      }
    }

    const result = await bulkUpdatePermissions(
      changes as { role: UserRole; module: string; actions: string[] }[],
      caller.id
    );

    if (!result.success) {
      return apiError(result.error || "Error al actualizar permisos", 500);
    }

    await logAudit({
      userId: caller.id,
      action: "permissions.update",
      resource: "role_permissions",
      details: { changesCount: changes.length },
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiServerError(error);
  }
}
