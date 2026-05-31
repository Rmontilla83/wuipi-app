// GET /api/cobranzas/panel/whoami
//
// Endpoint de diagnóstico — devuelve el estado real de la sesión y el
// permiso de Cobranzas para el cliente actual. Sirve para diferenciar:
//   - sesión no establecida (cookies no llegaron)
//   - profile no encontrado (mismatch de id)
//   - profile inactivo
//   - rol sin permiso cobranzas:read
//
// NO usa requirePermission para poder devolver el motivo cuando la
// verificación falla. Acceso público a la respuesta — solo expone datos
// del propio usuario autenticado o "no autenticado".

export const dynamic = "force-dynamic";

import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { apiSuccess } from "@/lib/api-helpers";

export async function GET() {
  const sb = createServerSupabase();
  const { data: { user }, error: authError } = await sb.auth.getUser();

  if (authError || !user) {
    return apiSuccess({
      hasSession: false,
      reason: "no_session",
      detail: authError?.message || "auth.getUser() devolvió null",
      canRead: false,
    });
  }

  const admin = createAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, role, is_active, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return apiSuccess({
      hasSession: true,
      userId: user.id,
      email: user.email,
      reason: "profile_query_error",
      detail: profileError.message,
      canRead: false,
    });
  }

  if (!profile) {
    return apiSuccess({
      hasSession: true,
      userId: user.id,
      email: user.email,
      reason: "profile_not_found",
      detail: `Usuario autenticado pero no existe fila en profiles con id=${user.id}`,
      canRead: false,
    });
  }

  if (!profile.is_active) {
    return apiSuccess({
      hasSession: true,
      userId: user.id,
      email: profile.email,
      role: profile.role,
      reason: "profile_inactive",
      canRead: false,
    });
  }

  const allowed = can(profile.role, "cobranzas", "read");

  return apiSuccess({
    hasSession: true,
    userId: user.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
    canRead: allowed,
    reason: allowed ? "ok" : "role_not_allowed",
  });
}
