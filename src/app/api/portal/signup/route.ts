import { NextRequest, NextResponse } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, findPartnerByEmail } from "@/lib/integrations/odoo-new";
import { createPortalUser, findPortalUserByEmail } from "@/lib/auth/portal-auth";
import { setPortalSessionOnResponse } from "@/lib/auth/portal-session";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`signup:ip:${ip}`, 5, 10 * 60_000);
    if (!rl.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    if (!isConfigured()) {
      return apiError("Sistema no disponible", 503);
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !email.includes("@") || email.length > 254) {
      return apiError("Email inválido", 400);
    }
    if (!password || password.length < 8) {
      return apiError("La contraseña debe tener al menos 8 caracteres", 400);
    }

    // Solo clientes registrados en Odoo pueden crear cuenta
    const partner = await findPartnerByEmail(email, { customersOnly: true });
    if (!partner) {
      return apiError("Este correo no está registrado como cliente Wuipi. Verifica el email o contacta a soporte.", 403);
    }

    // Si ya tiene cuenta, no permitimos signup duplicado
    const existing = await findPortalUserByEmail(email);
    if (existing) {
      return apiError("Esta cuenta ya existe. Inicia sesión con tu contraseña o usa 'Olvidé mi contraseña'.", 409);
    }

    const created = await createPortalUser({ email, password, partnerId: partner.id });
    if (!created.ok) {
      const status = created.code === "weak_password" ? 400 : created.code === "email_already_in_use" ? 409 : 500;
      return apiError(created.message, status);
    }

    const response = NextResponse.json({ ok: true, partner_id: partner.id });
    setPortalSessionOnResponse(response, {
      pid: partner.id,
      name: partner.name,
      email: partner.email ?? email,
    });
    return response;
  } catch (error) {
    return apiServerError(error);
  }
}
