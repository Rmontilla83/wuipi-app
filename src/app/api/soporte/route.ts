import { NextResponse } from "next/server";
import type { SupportOverview } from "@/types/support";

const MOCK_DATA: SupportOverview = {
  tickets_today: 153,
  tickets_open: 23,
  tickets_in_progress: 18,
  tickets_pending: 7,
  tickets_resolved_today: 112,
  tickets_unassigned: 5,

  total_clients_affected: 2340,
  unique_clients_today: 98,
  repeat_clients: 34,
  repeat_client_pct: 34.7,

  sla: {
    total_tickets: 153,
    within_sla: 119,
    breached_sla: 34,
    compliance_rate: 77.8,
    avg_resolution_hours: 2.4,
    avg_first_response_minutes: 18,
  },

  by_category: [
    { category: "sin_servicio", label: "Sin Servicio", count: 38, percentage: 24.8, avg_resolution_hours: 3.1, trend: "up" },
    { category: "lentitud", label: "Lentitud", count: 34, percentage: 22.2, avg_resolution_hours: 1.8, trend: "stable" },
    { category: "intermitencia", label: "Intermitencia", count: 28, percentage: 18.3, avg_resolution_hours: 2.6, trend: "up" },
    { category: "instalacion", label: "Instalación", count: 19, percentage: 12.4, avg_resolution_hours: 4.2, trend: "down" },
    { category: "facturacion", label: "Facturación", count: 15, percentage: 9.8, avg_resolution_hours: 1.2, trend: "stable" },
    { category: "equipos", label: "Equipos", count: 11, percentage: 7.2, avg_resolution_hours: 3.8, trend: "stable" },
    { category: "mudanza", label: "Mudanza", count: 5, percentage: 3.3, avg_resolution_hours: 24.0, trend: "down" },
    { category: "otro", label: "Otro", count: 3, percentage: 2.0, avg_resolution_hours: 1.5, trend: "stable" },
  ],

  by_zone: [
    { zone: "Lechería-Norte", tickets_total: 42, tickets_open: 8, tickets_resolved: 34, avg_resolution_hours: 3.2, top_category: "sin_servicio", clients_affected: 38, repeat_clients: 14 },
    { zone: "Lechería-Sur", tickets_total: 18, tickets_open: 2, tickets_resolved: 16, avg_resolution_hours: 1.6, top_category: "lentitud", clients_affected: 16, repeat_clients: 3 },
    { zone: "Barcelona-Centro", tickets_total: 31, tickets_open: 4, tickets_resolved: 27, avg_resolution_hours: 2.1, top_category: "lentitud", clients_affected: 28, repeat_clients: 6 },
    { zone: "Barcelona-Sur", tickets_total: 28, tickets_open: 5, tickets_resolved: 23, avg_resolution_hours: 2.8, top_category: "intermitencia", clients_affected: 24, repeat_clients: 8 },
    { zone: "Puerto La Cruz", tickets_total: 22, tickets_open: 3, tickets_resolved: 19, avg_resolution_hours: 1.9, top_category: "instalacion", clients_affected: 20, repeat_clients: 2 },
    { zone: "Guanta", tickets_total: 12, tickets_open: 1, tickets_resolved: 11, avg_resolution_hours: 1.4, top_category: "facturacion", clients_affected: 11, repeat_clients: 1 },
  ],

  by_technician: [
    { id: "t1", name: "José Rodríguez", tickets_total: 47, tickets_resolved: 42, tickets_open: 5, avg_resolution_hours: 1.2, sla_compliance: 95.7, satisfaction_score: 4.8, specialties: ["sin_servicio", "intermitencia"] },
    { id: "t2", name: "Carlos Pérez", tickets_total: 38, tickets_resolved: 31, tickets_open: 7, avg_resolution_hours: 2.1, sla_compliance: 84.2, satisfaction_score: 4.1, specialties: ["lentitud", "equipos"] },
    { id: "t3", name: "Miguel Ángel", tickets_total: 35, tickets_resolved: 28, tickets_open: 7, avg_resolution_hours: 2.8, sla_compliance: 74.3, satisfaction_score: 3.9, specialties: ["instalacion", "mudanza"] },
    { id: "t4", name: "Luis García", tickets_total: 33, tickets_resolved: 24, tickets_open: 9, avg_resolution_hours: 3.1, sla_compliance: 69.7, satisfaction_score: 3.7, specialties: ["lentitud", "facturacion"] },
  ],

  recent_tickets: [
    { id: "T-4532", client_id: "c1", client_name: "María González", client_plan: "50Mbps", zone: "Lechería-Norte", category: "sin_servicio", priority: "critical", status: "open", subject: "Sin servicio desde las 7am", assigned_to: "t1", technician_name: "José Rodríguez", created_at: new Date(Date.now() - 12 * 60000).toISOString(), updated_at: new Date(Date.now() - 5 * 60000).toISOString(), sla_deadline: new Date(Date.now() + 2 * 3600000).toISOString(), sla_breached: false, node: "OLT Lechería-Norte" },
    { id: "T-4531", client_id: "c2", client_name: "Pedro Ramírez", client_plan: "30Mbps", zone: "Barcelona-Sur", category: "intermitencia", priority: "high", status: "in_progress", subject: "Internet se cae cada 20 minutos", assigned_to: "t2", technician_name: "Carlos Pérez", created_at: new Date(Date.now() - 45 * 60000).toISOString(), updated_at: new Date(Date.now() - 10 * 60000).toISOString(), sla_deadline: new Date(Date.now() + 1 * 3600000).toISOString(), sla_breached: false, node: "OLT Barcelona-Sur" },
    { id: "T-4530", client_id: "c3", client_name: "Ana López", client_plan: "100Mbps", zone: "Barcelona-Centro", category: "lentitud", priority: "medium", status: "in_progress", subject: "Velocidad no llega al plan contratado", assigned_to: "t2", technician_name: "Carlos Pérez", created_at: new Date(Date.now() - 90 * 60000).toISOString(), updated_at: new Date(Date.now() - 30 * 60000).toISOString(), sla_deadline: new Date(Date.now() + 4 * 3600000).toISOString(), sla_breached: false },
    { id: "T-4529", client_id: "c4", client_name: "Roberto Díaz", client_plan: "30Mbps", zone: "Lechería-Norte", category: "sin_servicio", priority: "critical", status: "open", subject: "Sin internet, luz del router roja", created_at: new Date(Date.now() - 25 * 60000).toISOString(), updated_at: new Date(Date.now() - 25 * 60000).toISOString(), sla_deadline: new Date(Date.now() + 1.5 * 3600000).toISOString(), sla_breached: false, node: "OLT Lechería-Norte" },
    { id: "T-4528", client_id: "c5", client_name: "Carmen Herrera", client_plan: "50Mbps", zone: "Puerto La Cruz", category: "instalacion", priority: "low", status: "pending", subject: "Instalación nueva - Plan 50Mbps", assigned_to: "t3", technician_name: "Miguel Ángel", created_at: new Date(Date.now() - 3 * 3600000).toISOString(), updated_at: new Date(Date.now() - 2 * 3600000).toISOString(), sla_deadline: new Date(Date.now() + 24 * 3600000).toISOString(), sla_breached: false },
    { id: "T-4527", client_id: "c1", client_name: "María González", client_plan: "50Mbps", zone: "Lechería-Norte", category: "sin_servicio", priority: "high", status: "resolved", subject: "Sin servicio - segundo reporte esta semana", assigned_to: "t1", technician_name: "José Rodríguez", created_at: new Date(Date.now() - 8 * 3600000).toISOString(), updated_at: new Date(Date.now() - 6 * 3600000).toISOString(), resolved_at: new Date(Date.now() - 6 * 3600000).toISOString(), sla_deadline: new Date(Date.now() - 4 * 3600000).toISOString(), sla_breached: false, resolution_time_hours: 2.0, node: "OLT Lechería-Norte" },
    { id: "T-4526", client_id: "c6", client_name: "José Martínez", client_plan: "30Mbps", zone: "Barcelona-Sur", category: "lentitud", priority: "medium", status: "resolved", subject: "Velocidad baja en horas pico", assigned_to: "t4", technician_name: "Luis García", created_at: new Date(Date.now() - 10 * 3600000).toISOString(), updated_at: new Date(Date.now() - 7 * 3600000).toISOString(), resolved_at: new Date(Date.now() - 7 * 3600000).toISOString(), sla_deadline: new Date(Date.now() - 3 * 3600000).toISOString(), sla_breached: false, resolution_time_hours: 3.0 },
    { id: "T-4525", client_id: "c7", client_name: "Laura Fernández", client_plan: "100Mbps", zone: "Guanta", category: "facturacion", priority: "low", status: "closed", subject: "Cobro doble en factura de enero", assigned_to: "t4", technician_name: "Luis García", created_at: new Date(Date.now() - 24 * 3600000).toISOString(), updated_at: new Date(Date.now() - 20 * 3600000).toISOString(), resolved_at: new Date(Date.now() - 20 * 3600000).toISOString(), closed_at: new Date(Date.now() - 18 * 3600000).toISOString(), sla_deadline: new Date(Date.now() - 12 * 3600000).toISOString(), sla_breached: false, resolution_time_hours: 4.0 },
  ],

  timeline: [
    { hour: "06", count: 3 }, { hour: "07", count: 5 }, { hour: "08", count: 14 },
    { hour: "09", count: 22 }, { hour: "10", count: 25 }, { hour: "11", count: 18 },
    { hour: "12", count: 9 }, { hour: "13", count: 11 }, { hour: "14", count: 16 },
    { hour: "15", count: 19 }, { hour: "16", count: 14 }, { hour: "17", count: 8 },
  ],

  updated_at: new Date().toISOString(),
};

export async function GET() {
  try {
    // TODO: When Kommo is connected, fetch real data and transform
    return NextResponse.json(MOCK_DATA);
  } catch (error) {
    console.error("Support data error:", error);
    return NextResponse.json(MOCK_DATA);
  }
}
