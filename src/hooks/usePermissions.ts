"use client";

import { useMemo } from "react";
import type { UserRole } from "@/types";
import { can, hasRole, canManageUsers, canCreateRole, getAllowedModules } from "@/lib/auth/permissions";
import type { Module, Action } from "@/lib/auth/permissions";

export function usePermissions(role: UserRole) {
  return useMemo(() => ({
    can: (module: Module, action: Action) => can(role, module, action),
    hasRole: (required: UserRole) => hasRole(role, required),
    canManageUsers: () => canManageUsers(role),
    canCreateRole: (target: UserRole) => canCreateRole(role, target),
    allowedModules: getAllowedModules(role),
    isSuperAdmin: role === "super_admin",
    isAdmin: role === "super_admin" || role === "admin",
  }), [role]);
}
