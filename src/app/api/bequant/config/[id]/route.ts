import { NextRequest } from "next/server";
import {
  getBequantConfig, updateBequantConfigPartial, deleteBequantConfig, logBequantAccess,
} from "@/lib/dal/bequant";
import { invalidateConfigCache } from "@/lib/integrations/bequant";
import { validate, bequantConfigUpdateSchema } from "@/lib/validations/schemas";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    if (!isAdminRole(caller.role) && caller.role !== "infraestructura") {
      return apiError("Sin permisos", 403);
    }

    const config = await getBequantConfig(params.id);
    if (!config) return apiError("Configuración no encontrada", 404);
    const { encrypted_password: _unused, ...safe } = config;
    return apiSuccess(safe);
  } catch (error) {
    return apiServerError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    if (!isAdminRole(caller.role)) {
      return apiError("Solo administradores", 403);
    }

    const body = await request.json();
    const parsed = validate(bequantConfigUpdateSchema, body);
    if (!parsed.success) return apiError(parsed.error);

    const config = await updateBequantConfigPartial(params.id, parsed.data);
    invalidateConfigCache();

    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "save_config",
      metadata: { id: params.id, fields: Object.keys(parsed.data) },
    });

    const { encrypted_password: _unused, ...safe } = config;
    return apiSuccess(safe);
  } catch (error) {
    return apiServerError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    if (!isAdminRole(caller.role)) {
      return apiError("Solo administradores", 403);
    }

    await deleteBequantConfig(params.id);
    invalidateConfigCache();
    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "delete_config",
      metadata: { id: params.id },
    });
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiServerError(error);
  }
}
