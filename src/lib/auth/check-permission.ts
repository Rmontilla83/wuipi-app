// Server-side permission check for API routes
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import { getPermissionsForRole } from "@/lib/dal/permissions";
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
 * Get the current portal user (cliente) from Supabase session.
 * Verifies JWT server-side and extracts odoo_partner_id from app_metadata.
 * Returns null if not authenticated or not a portal client.
 */
export async function getPortalCaller(): Promise<PortalCallerInfo | null> {
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
