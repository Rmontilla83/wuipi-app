import { NextRequest, NextResponse } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, findPartnerByEmail } from "@/lib/integrations/odoo-new";
import { signInPortalUser } from "@/lib/auth/portal-auth";
import { setPortalSessionOnResponse } from "@/lib/auth/portal-session";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`login:ip:${ip}`, 10, 10 * 60_000);
    if (!rl.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    if (!isConfigured()) {
      return apiError("Sistema no disponible", 503);
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !email.includes("@") || !password) {
      return apiError("Email o contraseña inválidos", 400);
    }

    const rlEmail = checkRateLimit(`login:em:${email}`, 10, 10 * 60_000);
    if (!rlEmail.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    const result = await signInPortalUser({ email, password });
    if (!result.ok) {
      // Mismo mensaje para invalid_credentials y unknown — no leak.
      return apiError("Email o contraseña incorrectos", 401);
    }

    // Para setear wpi_session necesitamos el partner_id. Si está en
    // app_metadata, lo usamos directo. Sino, buscamos el partner por email.
    let partnerId = result.partnerId;
    let partnerName: string | undefined;
    let partnerEmail = email;

    if (!partnerId) {
      const partner = await findPartnerByEmail(email, { customersOnly: true });
      if (!partner) {
        // Edge case: el user existe en Supabase pero NO en Odoo. Bloqueamos.
        return apiError("No encontramos tu cuenta de cliente en el sistema. Contacta a soporte.", 403);
      }
      partnerId = partner.id;
      partnerName = partner.name;
      partnerEmail = partner.email ?? email;
    } else {
      // Si tenemos partnerId en metadata, igual buscamos partner para name/email cached
      const partner = await findPartnerByEmail(email, { customersOnly: true });
      partnerName = partner?.name;
      partnerEmail = partner?.email ?? email;
    }

    const response = NextResponse.json({ ok: true, partner_id: partnerId });
    setPortalSessionOnResponse(response, {
      pid: partnerId,
      name: partnerName,
      email: partnerEmail,
    });
    return response;
  } catch (error) {
    return apiServerError(error);
  }
}
