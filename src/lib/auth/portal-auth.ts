// ============================================================
// Portal Auth — wrapper sobre Supabase Auth para login/signup/reset
// del portal de clientes.
//
// Storage: Supabase Auth (hash de password, reset flow).
// Session: cookie HMAC propia (wpi_session) — la cookie de Supabase
// NO se usa porque el webview de WhatsApp no la propaga confiable.
// ============================================================

import { createAdminSupabase } from "@/lib/supabase/server";

const ADMIN_PAGE_SIZE = 1000;

/**
 * Encuentra un user de Supabase Auth por email. Devuelve `null` si no existe.
 *
 * Usa `auth.admin.listUsers()` paginado. Para wuipi-app esto es aceptable
 * (low thousands de portal users esperados); si más adelante se vuelve
 * lento, migrar a una stored procedure que consulte `auth.users` directo.
 */
export async function findPortalUserByEmail(email: string): Promise<{
  userId: string;
  email: string;
  partnerId: number | null;
} | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const admin = createAdminSupabase();

  // Paginate listUsers hasta encontrar el user o agotar.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: ADMIN_PAGE_SIZE });
    if (error) throw new Error(`Supabase listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) {
      const meta = (found.app_metadata ?? {}) as Record<string, unknown>;
      const partnerId = typeof meta.partner_id === "number" ? meta.partner_id : null;
      return { userId: found.id, email: found.email ?? normalized, partnerId };
    }
    if (data.users.length < ADMIN_PAGE_SIZE) return null;
    page++;
    if (page > 50) {
      // Safety stop a 50k usuarios — más que suficiente para Wuipi.
      throw new Error("findPortalUserByEmail: too many users to scan");
    }
  }
}

export interface CreatePortalUserResult {
  userId: string;
  ok: true;
}

export type CreatePortalUserError =
  | { ok: false; code: "weak_password"; message: string }
  | { ok: false; code: "email_already_in_use"; message: string }
  | { ok: false; code: "unknown"; message: string };

/**
 * Crea un user en Supabase Auth con el partner_id de Odoo en app_metadata.
 * Email_confirm=true para evitar el correo de verificación de Supabase
 * (nosotros ya validamos contra Odoo antes de llamar).
 */
export async function createPortalUser(opts: {
  email: string;
  password: string;
  partnerId: number;
}): Promise<CreatePortalUserResult | CreatePortalUserError> {
  if (!opts.password || opts.password.length < 8) {
    return { ok: false, code: "weak_password", message: "La contraseña debe tener al menos 8 caracteres" };
  }
  const admin = createAdminSupabase();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email.trim().toLowerCase(),
    password: opts.password,
    email_confirm: true,
    app_metadata: { partner_id: opts.partnerId, portal: true },
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      return { ok: false, code: "email_already_in_use", message: "Ese email ya tiene una cuenta. Inicia sesión." };
    }
    return { ok: false, code: "unknown", message: error.message };
  }
  if (!data.user) {
    return { ok: false, code: "unknown", message: "No se pudo crear la cuenta" };
  }
  return { ok: true, userId: data.user.id };
}

export interface SignInResult {
  ok: true;
  userId: string;
  partnerId: number | null;
}

export type SignInError =
  | { ok: false; code: "invalid_credentials" }
  | { ok: false; code: "unknown"; message: string };

/**
 * Sign in con email + password. Devuelve userId + partnerId si OK,
 * o el código de error normalizado.
 */
export async function signInPortalUser(opts: {
  email: string;
  password: string;
}): Promise<SignInResult | SignInError> {
  const admin = createAdminSupabase();
  // Usamos signInWithPassword del admin client — autentica contra Supabase
  // pero NO setea cookie de Supabase (las cookies de Supabase no las usamos).
  const { data, error } = await admin.auth.signInWithPassword({
    email: opts.email.trim().toLowerCase(),
    password: opts.password,
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid") || msg.includes("credentials")) {
      return { ok: false, code: "invalid_credentials" };
    }
    return { ok: false, code: "unknown", message: error.message };
  }
  if (!data.user) return { ok: false, code: "invalid_credentials" };
  const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
  const partnerId = typeof meta.partner_id === "number" ? meta.partner_id : null;
  return { ok: true, userId: data.user.id, partnerId };
}

/**
 * Envía el email de reset de Supabase. Después de hacer click, el cliente
 * llega a `/portal/reset-password` con un access_token en el hash.
 */
export async function requestPortalPasswordReset(opts: {
  email: string;
  redirectTo: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createAdminSupabase();
  const { error } = await admin.auth.resetPasswordForEmail(opts.email.trim().toLowerCase(), {
    redirectTo: opts.redirectTo,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Actualiza la password del usuario autenticado. Usa el access_token
 * que Supabase devuelve en el reset link.
 */
export async function confirmPortalPasswordReset(opts: {
  accessToken: string;
  newPassword: string;
}): Promise<{ ok: true; userId: string; email: string; partnerId: number | null } | { ok: false; message: string }> {
  if (!opts.newPassword || opts.newPassword.length < 8) {
    return { ok: false, message: "La contraseña debe tener al menos 8 caracteres" };
  }
  const admin = createAdminSupabase();
  // Recover the user from the access_token, then update password.
  const { data: userData, error: getUserError } = await admin.auth.getUser(opts.accessToken);
  if (getUserError || !userData.user) {
    return { ok: false, message: "Enlace inválido o expirado" };
  }
  const { error: updateError } = await admin.auth.admin.updateUserById(userData.user.id, {
    password: opts.newPassword,
  });
  if (updateError) return { ok: false, message: updateError.message };
  const meta = (userData.user.app_metadata ?? {}) as Record<string, unknown>;
  const partnerId = typeof meta.partner_id === "number" ? meta.partner_id : null;
  return {
    ok: true,
    userId: userData.user.id,
    email: userData.user.email ?? "",
    partnerId,
  };
}
