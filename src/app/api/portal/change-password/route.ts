import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { getPortalCaller } from "@/lib/auth/check-permission";
import { findPortalUserByEmail, signInPortalUser } from "@/lib/auth/portal-auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const portal = await getPortalCaller();
    if (!portal || !portal.email) {
      return apiError("Sesión inválida", 401);
    }

    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`change-pw:ip:${ip}`, 5, 10 * 60_000);
    if (!rl.allowed) {
      return apiError("Demasiados intentos. Esperá unos minutos.", 429);
    }

    const body = await request.json();
    const currentPassword = typeof body?.current_password === "string" ? body.current_password : "";
    const newPassword = typeof body?.new_password === "string" ? body.new_password : "";

    if (!currentPassword || !newPassword) {
      return apiError("Faltan datos", 400);
    }
    if (newPassword.length < 8) {
      return apiError("La nueva contraseña debe tener al menos 8 caracteres", 400);
    }
    if (currentPassword === newPassword) {
      return apiError("La nueva contraseña debe ser distinta de la actual", 400);
    }

    // Verifica que la contraseña actual sea correcta antes de cambiarla
    const verifyResult = await signInPortalUser({ email: portal.email, password: currentPassword });
    if (!verifyResult.ok) {
      return apiError("La contraseña actual es incorrecta", 401);
    }

    // Resolve user id (Supabase user) — el portal caller no la tiene directa
    const user = await findPortalUserByEmail(portal.email);
    if (!user) {
      return apiError("No encontramos tu cuenta", 404);
    }

    const admin = createAdminSupabase();
    const { error } = await admin.auth.admin.updateUserById(user.userId, {
      password: newPassword,
    });
    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiServerError(error);
  }
}
