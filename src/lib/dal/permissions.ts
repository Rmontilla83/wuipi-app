import { createAdminSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

// ============================================================
// Types
// ============================================================

export interface RolePermissionRow {
  id: string;
  role: UserRole;
  module: string;
  actions: string[];
  updated_at: string;
  updated_by: string | null;
}

export type PermissionsMap = Record<string, Record<string, string[]>>;

// ============================================================
// In-memory cache (TTL 60s)
// ============================================================

let cachedPermissions: PermissionsMap | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

export function invalidatePermissionsCache() {
  cachedPermissions = null;
  cacheTimestamp = 0;
}

// ============================================================
// Read
// ============================================================

/**
 * Get all role permissions from DB, grouped by role → module → actions.
 * Uses in-memory cache with 60s TTL.
 */
export async function getRolePermissions(): Promise<PermissionsMap> {
  if (cachedPermissions && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedPermissions;
  }

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("role_permissions")
    .select("role, module, actions")
    .order("role")
    .order("module");

  if (error || !data) {
    console.error("[permissions-dal] Failed to load permissions:", error);
    return cachedPermissions ?? {};
  }

  const map: PermissionsMap = {};
  for (const row of data) {
    if (!map[row.role]) map[row.role] = {};
    map[row.role][row.module] = row.actions;
  }

  cachedPermissions = map;
  cacheTimestamp = Date.now();
  return map;
}

/**
 * Get permissions for a single role.
 */
export async function getPermissionsForRole(
  role: UserRole
): Promise<Record<string, string[]>> {
  const all = await getRolePermissions();
  return all[role] ?? {};
}

/**
 * Get sidebar-visible modules for a role (modules with at least one action).
 */
export async function getSidebarModules(role: UserRole): Promise<string[]> {
  const perms = await getPermissionsForRole(role);
  return Object.entries(perms)
    .filter(([, actions]) => actions.length > 0)
    .map(([mod]) => mod);
}

// ============================================================
// Write
// ============================================================

interface PermissionChange {
  role: UserRole;
  module: string;
  actions: string[];
}

/**
 * Bulk upsert permissions and invalidate cache.
 */
export async function bulkUpdatePermissions(
  changes: PermissionChange[],
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  const sb = createAdminSupabase();

  const rows = changes.map((c) => ({
    role: c.role,
    module: c.module,
    actions: c.actions,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await sb
    .from("role_permissions")
    .upsert(rows, { onConflict: "role,module" });

  if (error) {
    console.error("[permissions-dal] Bulk update failed:", error);
    return { success: false, error: error.message };
  }

  invalidatePermissionsCache();
  return { success: true };
}
