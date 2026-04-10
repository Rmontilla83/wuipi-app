import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { generateClientPaymentToken } from "@/lib/utils/payment-token";
import { getPortalCaller, getCallerProfile } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/payment-link?partnerId=12345
 * Returns the permanent payment URL for a client.
 * Accessible by portal clients (own partnerId only) and dashboard admins.
 */
export async function GET(request: NextRequest) {
  // Try portal auth first, then dashboard auth
  const portalCaller = await getPortalCaller();
  const dashboardCaller = !portalCaller ? await getCallerProfile() : null;

  if (!portalCaller && !dashboardCaller) {
    return apiError("No autenticado", 401);
  }

  const partnerId = parseInt(new URL(request.url).searchParams.get("partnerId") || "");
  if (!partnerId) return apiError("partnerId requerido", 400);

  // Portal users can only get their own payment link
  if (portalCaller && portalCaller.odoo_partner_id !== partnerId) {
    return apiError("Acceso denegado", 403);
  }

  const token = generateClientPaymentToken(partnerId);
  const origin = request.headers.get("host")?.includes("localhost")
    ? "http://localhost:3000"
    : "https://api.wuipi.net";

  return apiSuccess({
    token,
    url: `${origin}/pagar/cliente/${token}`,
  });
}
