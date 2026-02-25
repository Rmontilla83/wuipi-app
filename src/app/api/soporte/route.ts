import { NextRequest, NextResponse } from "next/server";
import * as kommo from "@/lib/integrations/kommo";

// Pipeline & Status IDs for "Embudo de SOPORTE"
const PIPELINE_ID = 12115128;
const STATUS = {
  incoming: 93531348,
  contactado: 93531352,
  pendiente: 93531356,
  tarea_l2c: 93531360,
  tarea_acceso: 93531364,
  pruebas: 94244843,
  atendido: 142,
  cerrado: 143,
} as const;

// Map status IDs to dashboard status
function mapStatus(statusId: number): string {
  switch (statusId) {
    case STATUS.incoming: return "open";
    case STATUS.contactado: return "in_progress";
    case STATUS.pendiente: return "pending";
    case STATUS.tarea_l2c: return "in_progress";
    case STATUS.tarea_acceso: return "in_progress";
    case STATUS.pruebas: return "in_progress";
    case STATUS.atendido: return "resolved";
    case STATUS.cerrado: return "closed";
    default: return "open";
  }
}

function mapStatusLabel(statusId: number): string {
  switch (statusId) {
    case STATUS.incoming: return "Incoming";
    case STATUS.contactado: return "Contactado";
    case STATUS.pendiente: return "Pendiente";
    case STATUS.tarea_l2c: return "Tarea L2C";
    case STATUS.tarea_acceso: return "Tarea de acceso";
    case STATUS.pruebas: return "Pruebas";
    case STATUS.atendido: return "Atendido";
    case STATUS.cerrado: return "Cerrado";
    default: return "Desconocido";
  }
}

// Detect category from lead name
function detectCategory(name: string): { category: string; label: string } {
  const lower = name.toLowerCase();
  if (lower.includes("sin servicio") || lower.includes("sin internet") || lower.includes("sin conexion")) return { category: "sin_servicio", label: "Sin Servicio" };
  if (lower.includes("lentitud") || lower.includes("lento") || lower.includes("velocidad")) return { category: "lentitud", label: "Lentitud" };
  if (lower.includes("intermitencia") || lower.includes("intermitente") || lower.includes("se cae")) return { category: "intermitencia", label: "Intermitencia" };
  if (lower.includes("instalacion") || lower.includes("instalación")) return { category: "instalacion", label: "Instalación" };
  if (lower.includes("mudanza") || lower.includes("traslado")) return { category: "mudanza", label: "Mudanza" };
  if (lower.includes("factur") || lower.includes("cobro") || lower.includes("pago")) return { category: "facturacion", label: "Facturación" };
  if (lower.includes("equipo") || lower.includes("router") || lower.includes("antena") || lower.includes("red interna")) return { category: "equipos", label: "Equipos" };
  return { category: "otro", label: "Otro" };
}

// Detect priority based on status and age
function detectPriority(statusId: number, createdAt: number): string {
  const hoursOld = (Date.now() / 1000 - createdAt) / 3600;
  if (statusId === STATUS.incoming && hoursOld > 4) return "critical";
  if (statusId === STATUS.incoming) return "high";
  if (hoursOld > 24 && statusId !== STATUS.atendido && statusId !== STATUS.cerrado) return "high";
  if (statusId === STATUS.pendiente) return "medium";
  return "medium";
}

// User map for quick lookups
interface UserInfo { id: number; name: string; isAdmin: boolean; groupId: number; }

export async function GET(request: NextRequest) {
  try {
    if (!kommo.isConfigured()) {
      return NextResponse.json({ error: "Kommo not configured", mock: true });
    }

    // Parse period
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    let fromTs: number | undefined;
    const now = Math.floor(Date.now() / 1000);
    switch (period) {
      case "today": { const td = new Date(); td.setHours(0,0,0,0); fromTs = Math.floor(td.getTime()/1000); break; }
      case "7d": fromTs = now - 7 * 86400; break;
      case "30d": fromTs = now - 30 * 86400; break;
      case "90d": fromTs = now - 90 * 86400; break;
    }

    // Fetch data in parallel
    const [usersData, leadsData] = await Promise.all([
      kommo.getUsers(),
      kommo.getAllLeadsByPipeline(PIPELINE_ID, fromTs),
    ]);

    const users: UserInfo[] = (usersData?._embedded?.users || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      isAdmin: u.rights?.is_admin || false,
      groupId: u.group_id || 0,
    }));

    const userMap = new Map(users.map(u => [u.id, u]));
    const leads = leadsData || [];

    // Time boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime() / 1000;

    // Classify leads
    const allActive = leads.filter((l: any) => l.status_id !== STATUS.atendido && l.status_id !== STATUS.cerrado);
    const resolvedToday = leads.filter((l: any) => l.status_id === STATUS.atendido && l.closed_at && l.closed_at >= todayTs);
    const createdToday = leads.filter((l: any) => l.created_at >= todayTs);
    const openLeads = leads.filter((l: any) => l.status_id === STATUS.incoming);
    const inProgressLeads = leads.filter((l: any) =>
      [STATUS.contactado, STATUS.tarea_l2c, STATUS.tarea_acceso, STATUS.pruebas].includes(l.status_id)
    );
    const pendingLeads = leads.filter((l: any) => l.status_id === STATUS.pendiente);

    // Unique contacts
    const contactIds = new Set<number>();
    const repeatContacts = new Map<number, number>();
    for (const lead of leads) {
      const contactId = lead._embedded?.contacts?.[0]?.id;
      if (contactId) {
        repeatContacts.set(contactId, (repeatContacts.get(contactId) || 0) + 1);
        contactIds.add(contactId);
      }
    }
    const repeatClientCount = [...repeatContacts.values()].filter(c => c > 1).length;

    // Category breakdown
    const categoryMap = new Map<string, { label: string; count: number }>();
    for (const lead of leads) {
      const { category, label } = detectCategory(lead.name || "");
      const existing = categoryMap.get(category) || { label, count: 0 };
      existing.count++;
      categoryMap.set(category, existing);
    }
    const totalLeads = leads.length || 1;
    const byCategory = [...categoryMap.entries()]
      .map(([category, data]) => ({
        category,
        label: data.label,
        count: data.count,
        percentage: Math.round((data.count / totalLeads) * 1000) / 10,
        avg_resolution_hours: 0,
        trend: "stable" as const,
      }))
      .sort((a, b) => b.count - a.count);

    // By technician (non-admin users with leads assigned)
    const techLeads = new Map<number, { total: number; resolved: number; open: number }>();
    for (const lead of leads) {
      const userId = lead.responsible_user_id;
      if (!userId) continue;
      const existing = techLeads.get(userId) || { total: 0, resolved: 0, open: 0 };
      existing.total++;
      if (lead.status_id === STATUS.atendido) existing.resolved++;
      else if (lead.status_id !== STATUS.cerrado) existing.open++;
      techLeads.set(userId, existing);
    }

    const byTechnician = [...techLeads.entries()]
      .map(([userId, stats]) => {
        const user = userMap.get(userId);
        return {
          id: `t-${userId}`,
          name: user?.name || `User ${userId}`,
          tickets_total: stats.total,
          tickets_resolved: stats.resolved,
          tickets_open: stats.open,
          avg_resolution_hours: 0,
          sla_compliance: stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0,
          satisfaction_score: 0,
          specialties: [] as string[],
        };
      })
      .filter(t => t.tickets_total > 0)
      .sort((a, b) => b.sla_compliance - a.sla_compliance);

    // Pipeline stages breakdown
    const byStage = [
      { stage: "Incoming", status_id: STATUS.incoming, count: openLeads.length, color: "#c1c1c1" },
      { stage: "Contactado", status_id: STATUS.contactado, count: leads.filter((l: any) => l.status_id === STATUS.contactado).length, color: "#98cbff" },
      { stage: "Pendiente", status_id: STATUS.pendiente, count: pendingLeads.length, color: "#fffd7f" },
      { stage: "Tarea L2C", status_id: STATUS.tarea_l2c, count: leads.filter((l: any) => l.status_id === STATUS.tarea_l2c).length, color: "#ffce5a" },
      { stage: "Tarea de acceso", status_id: STATUS.tarea_acceso, count: leads.filter((l: any) => l.status_id === STATUS.tarea_acceso).length, color: "#eb93ff" },
      { stage: "Pruebas", status_id: STATUS.pruebas, count: leads.filter((l: any) => l.status_id === STATUS.pruebas).length, color: "#99ccff" },
      { stage: "Atendido", status_id: STATUS.atendido, count: leads.filter((l: any) => l.status_id === STATUS.atendido).length, color: "#CCFF66" },
      { stage: "Cerrado", status_id: STATUS.cerrado, count: leads.filter((l: any) => l.status_id === STATUS.cerrado).length, color: "#D5D8DB" },
    ];

    // Recent tickets (last 20 active + recently resolved)
    const recentLeads = [...allActive, ...resolvedToday]
      .sort((a: any, b: any) => b.updated_at - a.updated_at)
      .slice(0, 20);

    const recentTickets = recentLeads.map((lead: any) => {
      const { category, label } = detectCategory(lead.name || "");
      const user = userMap.get(lead.responsible_user_id);
      return {
        id: `K-${lead.id}`,
        kommo_id: lead.id,
        client_name: lead.name?.split("|")?.[1]?.trim() || lead.name || `Lead #${lead.id}`,
        subject: lead.name?.split("|")?.[0]?.trim() || lead.name || "",
        category,
        category_label: label,
        priority: detectPriority(lead.status_id, lead.created_at),
        status: mapStatus(lead.status_id),
        status_label: mapStatusLabel(lead.status_id),
        assigned_to: user?.name || "Sin asignar",
        responsible_user_id: lead.responsible_user_id,
        created_at: new Date(lead.created_at * 1000).toISOString(),
        updated_at: new Date(lead.updated_at * 1000).toISOString(),
        closed_at: lead.closed_at ? new Date(lead.closed_at * 1000).toISOString() : null,
        contact_id: lead._embedded?.contacts?.[0]?.id || null,
      };
    });

    // Build response
    const response = {
      source: "kommo",
      period,
      pipeline: "Embudo de SOPORTE",
      pipeline_id: PIPELINE_ID,

      // Summary KPIs
      total_leads: leads.length,
      tickets_today: createdToday.length,
      tickets_open: openLeads.length,
      tickets_in_progress: inProgressLeads.length,
      tickets_pending: pendingLeads.length,
      tickets_resolved_today: resolvedToday.length,
      active_tickets: allActive.length,

      // Client metrics
      total_contacts: contactIds.size,
      repeat_clients: repeatClientCount,
      repeat_client_pct: contactIds.size > 0 ? Math.round((repeatClientCount / contactIds.size) * 1000) / 10 : 0,

      // Breakdowns
      by_stage: byStage,
      by_category: byCategory,
      by_technician: byTechnician,

      // Recent tickets
      recent_tickets: recentTickets,

      // Metadata
      users: users.map(u => ({ id: u.id, name: u.name, isAdmin: u.isAdmin })),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Soporte API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch support data", source: "error" },
      { status: 500 }
    );
  }
}
