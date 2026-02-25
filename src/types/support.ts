// ===========================================
// Support Module Type Definitions
// ===========================================

export type TicketStatus = "open" | "in_progress" | "pending" | "resolved" | "closed";
export type TicketPriority = "critical" | "high" | "medium" | "low";
export type TicketCategory =
  | "sin_servicio"
  | "lentitud"
  | "intermitencia"
  | "instalacion"
  | "mudanza"
  | "facturacion"
  | "equipos"
  | "otro";

export interface Ticket {
  id: string;
  kommo_id?: number;
  client_id: string;
  client_name: string;
  client_plan?: string;
  zone: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description?: string;
  assigned_to?: string;
  technician_name?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
  sla_deadline: string;
  sla_breached: boolean;
  resolution_time_hours?: number;
  node?: string;
}

export interface TechnicianStats {
  id: string;
  name: string;
  avatar?: string;
  tickets_total: number;
  tickets_resolved: number;
  tickets_open: number;
  avg_resolution_hours: number;
  sla_compliance: number; // percentage
  satisfaction_score: number; // 1-5
  specialties: TicketCategory[];
}

export interface ZoneStats {
  zone: string;
  tickets_total: number;
  tickets_open: number;
  tickets_resolved: number;
  avg_resolution_hours: number;
  top_category: TicketCategory;
  clients_affected: number;
  repeat_clients: number;
}

export interface CategoryStats {
  category: TicketCategory;
  label: string;
  count: number;
  percentage: number;
  avg_resolution_hours: number;
  trend: "up" | "down" | "stable";
}

export interface SLAMetrics {
  total_tickets: number;
  within_sla: number;
  breached_sla: number;
  compliance_rate: number;
  avg_resolution_hours: number;
  avg_first_response_minutes: number;
}

export interface SupportOverview {
  // Summary KPIs
  tickets_today: number;
  tickets_open: number;
  tickets_in_progress: number;
  tickets_pending: number;
  tickets_resolved_today: number;
  tickets_unassigned: number;

  // Client metrics
  total_clients_affected: number;
  unique_clients_today: number;
  repeat_clients: number;
  repeat_client_pct: number;

  // SLA
  sla: SLAMetrics;

  // Breakdowns
  by_category: CategoryStats[];
  by_zone: ZoneStats[];
  by_technician: TechnicianStats[];

  // Recent tickets
  recent_tickets: Ticket[];

  // Timeline (tickets per hour today)
  timeline: { hour: string; count: number }[];

  updated_at: string;
}

// Category display labels
export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  sin_servicio: "Sin Servicio",
  lentitud: "Lentitud",
  intermitencia: "Intermitencia",
  instalacion: "Instalación",
  mudanza: "Mudanza",
  facturacion: "Facturación",
  equipos: "Equipos",
  otro: "Otro",
};

export const CATEGORY_COLORS: Record<TicketCategory, string> = {
  sin_servicio: "#ef4444",
  lentitud: "#f59e0b",
  intermitencia: "#f97316",
  instalacion: "#06b6d4",
  mudanza: "#8b5cf6",
  facturacion: "#10b981",
  equipos: "#3b82f6",
  otro: "#64748b",
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  in_progress: "En Progreso",
  pending: "Pendiente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Medio",
  low: "Bajo",
};
