import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, findPartnerByEmail } from "@/lib/integrations/odoo-new";
import { findPortalUserByEmail, requestPortalPasswordReset } from "@/lib/auth/portal-auth";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`reset:ip:${ip}`, 3, 10 * 60_000);
    if (!rl.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    if (!isConfigured()) {
      return apiError("Sistema no disponible", 503);
    }

    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@") || email.length > 254) {
      return apiError("Email inválido", 400);
    }

    const rlEmail = checkRateLimit(`reset:em:${email}`, 3, 10 * 60_000);
    if (!rlEmail.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    const [partner, user] = await Promise.all([
      findPartnerByEmail(email, { customersOnly: true }),
      findPortalUserByEmail(email),
    ]);

    // Por seguridad (no enumeration), siempre respondemos 200. Pero solo
    // disparamos el email si existe el partner Y tiene cuenta Supabase.
    if (partner && user) {
      // Usar el origin del request actual — robusto contra deploys de preview
      // (donde NEXT_PUBLIC_APP_URL puede apuntar a producción). request.nextUrl.origin
      // siempre devuelve el dominio del deploy que está procesando este request.
      const redirectTo = `${request.nextUrl.origin}/portal/reset-password`;
      const result = await requestPortalPasswordReset({ email, redirectTo });
      if (!result.ok) {
        // No-op para el cliente, pero log el error real
        console.error("[reset-password/request] failed:", result.message);
      }
    }

    return apiSuccess({
      ok: true,
      message: "Si tu email está registrado, recibirás un enlace para restablecer tu contraseña.",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
