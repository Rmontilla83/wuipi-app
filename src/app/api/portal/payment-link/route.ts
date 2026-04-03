import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api-helpers";
import { generateClientPaymentToken } from "@/lib/utils/payment-token";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/payment-link?partnerId=12345
 * Returns the permanent payment URL for a client.
 */
export async function GET(request: NextRequest) {
  const partnerId = parseInt(new URL(request.url).searchParams.get("partnerId") || "");
  if (!partnerId) return apiError("partnerId requerido", 400);

  const token = generateClientPaymentToken(partnerId);
  const origin = request.headers.get("host")?.includes("localhost")
    ? "http://localhost:3000"
    : "https://api.wuipi.net";

  return apiSuccess({
    token,
    url: `${origin}/pagar/cliente/${token}`,
  });
}
