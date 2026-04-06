// ============================================================
// RBAC — Granular permission system
// ============================================================

import type { UserRole } from "@/types";

export type Module =
  | "cobranzas"
  | "soporte"
  | "ventas"
  | "mercantil"
  | "clientes"
  | "configuracion"
  | "usuarios"
  | "auditoria"
  | "infraestructura"
  | "erp"
  | "bequant"
  // Sidebar-only pseudo-modules
  | "comando"
  | "supervisor_ia"
  | "finanzas"
  | "portal_admin"
  | "actualizaciones";

export type Action = "create" | "read" | "update" | "delete" | "send" | "export" | "approve" | "assign" | "access";

/** All operational modules (excludes sidebar-only pseudo-modules) */
export const OPERATIONAL_MODULES: Module[] = [
  "cobranzas", "soporte", "ventas", "mercantil", "clientes",
  "configuracion", "usuarios", "auditoria", "infraestructura", "erp", "bequant",
];

/** Sidebar-only modules (visibility toggle, "access" action) */
export const SIDEBAR_ONLY_MODULES: Module[] = [
  "comando", "supervisor_ia", "finanzas", "portal_admin", "actualizaciones",
];

/** All modules */
export const ALL_MODULES: Module[] = [...OPERATIONAL_MODULES, ...SIDEBAR_ONLY_MODULES];

/** Actions available for operational modules */
export const OPERATIONAL_ACTIONS: Action[] = ["create", "read", "update", "delete", "send", "export", "approve", "assign"];

/** Map sidebar nav IDs → permission module names */
export const SIDEBAR_MODULE_MAP: Record<string, string> = {
  "comando":         "comando",
  "supervisor":      "supervisor_ia",
  "soporte":         "soporte",
  "ventas":          "ventas",
  "cobranzas":       "cobranzas",
  "bequant":         "bequant",
  "infraestructura": "infraestructura",
  "erp":             "erp",
  "finanzas":        "finanzas",
  "pagos":           "mercantil",
  "clientes":        "clientes",
  "portal-admin":    "portal_admin",
  "configuracion":   "configuracion",
  "actualizaciones": "actualizaciones",
};

/** Reverse map: permission module → sidebar nav ID */
export const MODULE_SIDEBAR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SIDEBAR_MODULE_MAP).map(([k, v]) => [v, k])
);

// Full permission map: role → module → allowed actions
const PERMISSIONS: Record<string, Partial<Record<Module, Action[]>>> = {
  super_admin: {
    cobranzas: ["create", "read", "update", "delete", "send", "export", "approve"],
    soporte: ["create", "read", "update", "delete", "assign"],
    ventas: ["create", "read", "update", "delete"],
    mercantil: ["create", "read", "update", "delete"],
    clientes: ["create", "read", "update", "delete"],
    configuracion: ["create", "read", "update", "delete"],
    usuarios: ["create", "read", "update", "delete"],
    auditoria: ["read"],
    infraestructura: ["create", "read", "update", "delete"],
    erp: ["create", "read", "update", "delete"],
    bequant: ["create", "read", "update", "delete"],
  },
  admin: {
    cobranzas: ["create", "read", "update", "delete", "send", "export"],
    soporte: ["create", "read", "update", "delete", "assign"],
    ventas: ["create", "read", "update", "delete"],
    mercantil: ["create", "read", "update", "delete"],
    clientes: ["create", "read", "update", "delete"],
    configuracion: ["read"],
    usuarios: ["create", "read", "update", "delete"],
    auditoria: ["read"],
    infraestructura: ["create", "read", "update", "delete"],
    erp: ["create", "read", "update", "delete"],
    bequant: ["create", "read", "update", "delete"],
  },
  gerente: {
    cobranzas: ["read", "approve"],
    soporte: ["read"],
    ventas: ["read"],
    mercantil: ["read"],
    clientes: ["read"],
    configuracion: [],
    usuarios: [],
    auditoria: ["read"],
    infraestructura: ["read"],
    erp: ["read"],
    bequant: ["read"],
  },
  supervisor: {
    cobranzas: ["read", "update"],
    soporte: ["create", "read", "update", "delete", "assign"],
    ventas: ["read"],
    mercantil: ["read"],
    clientes: ["read"],
    configuracion: [],
    usuarios: [],
    auditoria: [],
    infraestructura: [],
    erp: [],
    bequant: [],
  },
  analista_cobranzas: {
    cobranzas: ["create", "read", "update", "delete", "send", "export"],
    soporte: [],
    ventas: [],
    mercantil: [],
    clientes: ["read"],
    configuracion: [],
    usuarios: [],
    auditoria: [],
    infraestructura: [],
    erp: [],
    bequant: [],
  },
  analista_soporte: {
    cobranzas: [],
    soporte: ["create", "read", "update", "delete"],
    ventas: [],
    mercantil: [],
    clientes: ["read"],
    configuracion: [],
    usuarios: [],
    auditoria: [],
    infraestructura: [],
    erp: [],
    bequant: [],
  },
  // Legacy roles — map to closest new role
  finanzas: {
    cobranzas: ["create", "read", "update", "delete", "send", "export"],
    clientes: ["read"],
    erp: ["create", "read", "update", "delete"],
    mercantil: ["read"],
  },
  soporte: {
    soporte: ["create", "read", "update", "delete"],
    clientes: ["read"],
  },
  infraestructura: {
    infraestructura: ["create", "read", "update", "delete"],
    bequant: ["create", "read", "update", "delete"],
    clientes: ["read"],
  },
  tecnico: {
    soporte: ["create", "read", "update"],
  },
  vendedor: {
    ventas: ["create", "read", "update", "delete"],
    clientes: ["read"],
  },
  cliente: {},
};

/**
 * Check if a role has permission for a specific action on a module
 */
export function can(role: UserRole, module: Module, action: Action): boolean {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.includes(action);
}

/**
 * Check if a role is at or above a given level
 */
const ROLE_HIERARCHY: UserRole[] = [
  "super_admin", "admin", "gerente", "supervisor",
  "analista_cobranzas", "analista_soporte",
  "finanzas", "soporte", "infraestructura", "tecnico", "vendedor", "cliente",
];

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const userIdx = ROLE_HIERARCHY.indexOf(userRole);
  const reqIdx = ROLE_HIERARCHY.indexOf(requiredRole);
  if (userIdx === -1 || reqIdx === -1) return false;
  return userIdx <= reqIdx;
}

/**
 * Check if a role can manage users
 */
export function canManageUsers(role: UserRole): boolean {
  return can(role, "usuarios", "read");
}

/**
 * Check if a role can create a specific target role
 */
export function canCreateRole(creatorRole: UserRole, targetRole: UserRole): boolean {
  if (targetRole === "super_admin") return creatorRole === "super_admin";
  if (creatorRole === "super_admin" || creatorRole === "admin") return true;
  return false;
}

/**
 * Get all allowed modules for a role (modules with at least 'read' permission)
 */
export function getAllowedModules(role: UserRole): Module[] {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return [];
  return (Object.entries(rolePerms) as [Module, Action[]][])
    .filter(([, actions]) => actions && actions.length > 0)
    .map(([mod]) => mod);
}

/**
 * Role display config
 */
export const ROLE_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  super_admin:        { label: "Super Admin",        color: "text-red-400 bg-red-400/10",     description: "Acceso total al sistema" },
  admin:              { label: "Administrador",      color: "text-purple-400 bg-purple-400/10", description: "Gestión operativa completa" },
  gerente:            { label: "Gerente",            color: "text-blue-400 bg-blue-400/10",   description: "Reportes y aprobaciones" },
  supervisor:         { label: "Supervisor",         color: "text-cyan-400 bg-cyan-400/10",   description: "Monitoreo de equipo" },
  analista_cobranzas: { label: "Analista Cobranzas", color: "text-amber-400 bg-amber-400/10", description: "Gestión de cobros" },
  analista_soporte:   { label: "Analista Soporte",   color: "text-emerald-400 bg-emerald-400/10", description: "Gestión de tickets" },
  finanzas:           { label: "Finanzas",           color: "text-amber-400 bg-amber-400/10", description: "Módulo financiero" },
  soporte:            { label: "Soporte",            color: "text-emerald-400 bg-emerald-400/10", description: "Soporte técnico" },
  infraestructura:    { label: "Infraestructura",    color: "text-orange-400 bg-orange-400/10", description: "Infraestructura de red" },
  tecnico:            { label: "Técnico",            color: "text-gray-400 bg-gray-400/10",   description: "Soporte en campo" },
  vendedor:           { label: "Vendedor",           color: "text-green-400 bg-green-400/10", description: "Ventas" },
  cliente:            { label: "Cliente",            color: "text-gray-500 bg-gray-500/10",   description: "Portal de cliente" },
};
