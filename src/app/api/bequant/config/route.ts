import { NextRequest } from "next/server";
import { getBequantConfigs, saveBequantConfig, logBequantAccess } from "@/lib/dal/bequant";
import { invalidateConfigCache } from "@/lib/integrations/bequant";
import { validate, bequantConfigSchema } from "@/lib/validations/schemas";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    // Only admin and infra see the config (even read-only)
    if (!["admin", "super_admin", "infraestructura"].includes(caller.role)) {
      return apiError("Sin permisos", 403);
    }

    const configs = await getBequantConfigs();
    const safe = configs.map(({ encrypted_password: _unused, ...rest }) => rest);
    return apiSuccess(safe);
  } catch (error) {
    return apiServerError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    // Only admin can modify the config
    if (!["admin", "super_admin"].includes(caller.role)) {
      return apiError("Solo administradores pueden modificar la configuración", 403);
    }

    const body = await request.json();
    const parsed = validate(bequantConfigSchema, body);
    if (!parsed.success) return apiError(parsed.error);

    const config = await saveBequantConfig(parsed.data, caller.id);
    invalidateConfigCache();

    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "save_config",
      metadata: { host: parsed.data.host, label: parsed.data.label },
    });

    const { encrypted_password: _unused, ...safe } = config;
    return apiSuccess(safe, 201);
  } catch (error) {
    return apiServerError(error);
  }
}
