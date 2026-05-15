// Server-side permission check for API routes
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { getPermissionsForRole } from "@/lib/dal/permissions";
import { getPortalSessionFromCookieJar } from "@/lib/auth/portal-session";
import type { Module, Action } from "@/lib/auth/permissions";
import type { UserRole } from "@/types";

export interface CallerInfo {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

export interface PortalCallerInfo {
  id: string;
  email: string;
  role: "cliente";
  odoo_partner_id: number;
}

/**
 * Get the current authenticated user's profile (server-side).
 * Uses getUser() for server-side JWT verification (secure).
 * Returns null if not authenticated.
 */
export async function getCallerProfile(): Promise<CallerInfo | null> {
  const sb = createServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return null;

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", user.id)
    .single();

  if (!data || !data.is_active) return null;
  return data as CallerInfo;
}

/**
 * Get the current portal user (cliente) from Supabase session OR from the
 * HMAC `wpi_session` cookie set by /portal/invite/[token].
 *
 * The two sources coexist intentionally:
 *  - `wpi_session` is the primary path for customers arriving from WA/email
 *    invitations. It avoids Supabase Auth entirely, sidestepping all the
 *    webview/cookie/cache fragility we hit in production.
 *  - Supabase session is the legacy path for clients who log in by typing
 *    their email at /portal/acceso and clicking the Magic Link from the
 *    email itself, plus for admins (super_admin) who are inspecting a
 *    customer view.
 *
 * Returns null only if NEITHER source identifies a portal client.
 */
export async function getPortalCaller(): Promise<PortalCallerInfo | null> {
  // 1. Cookie HMAC propia (preferida — no toca Supabase).
  const session = getPortalSessionFromCookieJar();
  if (session && session.pid > 0) {
    return {
      // Sin user.id real de Supabase, derivamos uno determinístico desde el
      // partnerId. Mantiene shape consistente con la rama Supabase.
      id: `portal-session:${session.pid}`,
      email: session.email || "",
      role: "cliente",
      odoo_partner_id: session.pid,
    };
  }

  // 2. Sesión Supabase clásica.
  const sb = createServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return null;

  const partnerId = user.app_metadata?.odoo_partner_id;
  if (!partnerId) return null;

  return {
    id: user.id,
    email: user.email || "",
    role: "cliente",
    odoo_partner_id: Number(partnerId),
  };
}

/**
 * Check permission against DB first, fallback to hardcoded.
 */
async function canAsync(role: UserRole, module: Module, action: Action): Promise<boolean> {
  try {
    const perms = await getPermissionsForRole(role);
    const moduleActions = perms[module];
    if (moduleActions !== undefined) {
      return moduleActions.includes(action);
    }
  } catch {
    // DB unavailable — fall through to hardcoded
  }
  return can(role, module, action);
}

/**
 * Check if the current user can perform an action on a module.
 * Returns the caller profile if authorized, or null.
 */
export async function requirePermission(
  module: Module,
  action: Action
): Promise<CallerInfo | null> {
  const caller = await getCallerProfile();
  if (!caller) return null;
  if (!(await canAsync(caller.role, module, action))) return null;
  return caller;
}
