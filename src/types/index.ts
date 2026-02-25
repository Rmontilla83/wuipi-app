// ===========================================
// WUIPI APP - Core Type Definitions
// ===========================================

export type UserRole = "admin" | "soporte" | "finanzas" | "infraestructura" | "tecnico" | "cliente";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  module: string;
  details: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

// Module health scores for command center
export interface ModuleHealth {
  module: "red" | "soporte" | "finanzas" | "clientes";
  score: number;
  status: "operational" | "degraded" | "warning" | "critical";
  trend: string;
  updated_at: string;
}

// Dashboard permission map
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ["comando", "supervisor", "infraestructura", "soporte", "finanzas", "configuracion"],
  soporte: ["comando", "soporte"],
  finanzas: ["comando", "finanzas"],
  infraestructura: ["comando", "infraestructura"],
  tecnico: ["soporte"],
  cliente: ["portal"],
};

export type { NetworkOverview, NetworkNode, NetworkAlert } from "./prtg";
export type { SupportOverview, Ticket, TechnicianStats, ZoneStats, CategoryStats } from "./support";
export { CATEGORY_LABELS, CATEGORY_COLORS, STATUS_LABELS, PRIORITY_LABELS } from "./support";
