import { NextRequest } from "next/server";
import { testConnection } from "@/lib/integrations/bequant";
import { updateTestResult, logBequantAccess } from "@/lib/dal/bequant";
import { validate, bequantTestConnectionSchema } from "@/lib/validations/schemas";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("bequant", "read");
    if (!caller) return apiError("Sin permisos", 403);
    if (!["admin", "super_admin", "infraestructura"].includes(caller.role)) {
      return apiError("Sin permisos", 403);
    }

    const body = await request.json();
    const parsed = validate(bequantTestConnectionSchema, body);
    if (!parsed.success) return apiError(parsed.error);

    const { host, port = 7343, username, password, configId } = parsed.data;
    const result = await testConnection(host, port, username, password);

    if (configId) {
      try {
        await updateTestResult(configId, result.success ? "success" : "error", result.message);
      } catch { /* non-critical */ }
    }

    await logBequantAccess({
      userId: caller.id, userEmail: caller.email,
      action: "test_connection",
      metadata: { host, port, success: result.success },
    });

    return apiSuccess(result);
  } catch (error) {
    return apiServerError(error);
  }
}
