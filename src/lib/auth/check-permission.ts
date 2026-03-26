// Server-side permission check for API routes
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { can } from "@/lib/auth/permissions";
import type { Module, Action } from "@/lib/auth/permissions";
import type { UserRole } from "@/types";

interface CallerInfo {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

/**
 * Get the current authenticated user's profile (server-side).
 * Returns null if not authenticated.
 */
export async function getCallerProfile(): Promise<CallerInfo | null> {
  const sb = createServerSupabase();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return null;

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("profiles")
    .select("id, email, role, is_active")
    .eq("id", session.user.id)
    .single();

  if (!data || !data.is_active) return null;
  return data as CallerInfo;
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
  if (!can(caller.role, module, action)) return null;
  return caller;
}
