import { NextRequest, NextResponse } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, findPartnerByEmail } from "@/lib/integrations/odoo-new";
import { confirmPortalPasswordReset } from "@/lib/auth/portal-auth";
import { setPortalAuthOnResponse } from "@/lib/auth/portal-session";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`reset-confirm:ip:${ip}`, 5, 10 * 60_000);
    if (!rl.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    if (!isConfigured()) {
      return apiError("Sistema no disponible", 503);
    }

    const body = await request.json();
    const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
    const newPassword = typeof body?.password === "string" ? body.password : "";

    if (!accessToken) {
      return apiError("Token de recuperación inválido", 400);
    }
    if (!newPassword || newPassword.length < 8) {
      return apiError("La contraseña debe tener al menos 8 caracteres", 400);
    }

    const result = await confirmPortalPasswordReset({ accessToken, newPassword });
    if (!result.ok) {
      return apiError(result.message, 400);
    }

    // Resolver partner_id si no estaba en metadata
    let partnerId = result.partnerId;
    let partnerName: string | undefined;
    if (!partnerId) {
      const partner = await findPartnerByEmail(result.email, { customersOnly: true });
      if (!partner) {
        return apiError("No encontramos tu cuenta de cliente. Contacta a soporte.", 403);
      }
      partnerId = partner.id;
      partnerName = partner.name;
    }

    const response = NextResponse.json({ ok: true, partner_id: partnerId });
    setPortalAuthOnResponse(response, {
      pid: partnerId,
      name: partnerName,
      email: result.email,
    });
    return response;
  } catch (error) {
    return apiServerError(error);
  }
}
