import { createAdminSupabase } from "@/lib/supabase/server";
import { nextSequence } from "./facturacion";

const supabase = () => createAdminSupabase();

function escSearch(s: string): string {
  return s.replace(/[%_\\,.()"]/g, "");
}

// ============================================
// TICKET CATEGORIES
// ============================================
export async function getTicketCategories(activeOnly = true) {
  let query = supabase()
    .from("ticket_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

// ============================================
// TICKETS
// ============================================
export async function getTickets(options?: {
  search?: string;
  status?: string;
  priority?: string;
  category_id?: string;
  assigned_to?: string;
  client_id?: string;
  page?: number;
  limit?: number;
}) {
  const page = options?.page || 1;
  const limit = Math.min(options?.limit || 50, 100);
  const offset = (page - 1) * limit;

  let query = supabase()
    .from("tickets")
    .select(`
      *,
      clients(id, code, legal_name, phone),
      ticket_categories(id, name, slug, color),
      assigned:profiles!tickets_assigned_to_fkey(id, full_name, email),
      creator:profiles!tickets_created_by_fkey(id, full_name)
    `, { count: "exact" })
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.search) {
    const s = escSearch(options.search.trim());
    if (s) {
      query = query.or(`subject.ilike.%${s}%,ticket_number.ilike.%${s}%`);
    }
  }
  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.priority && options.priority !== "all") {
    query = query.eq("priority", options.priority);
  }
  if (options?.category_id) {
    query = query.eq("category_id", options.category_id);
  }
  if (options?.assigned_to) {
    query = query.eq("assigned_to", options.assigned_to);
  }
  if (options?.client_id) {
    query = query.eq("client_id", options.client_id);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    data: data || [],
    total: count || 0,
    page,
    limit,
  };
}

export async function getTicket(id: string) {
  const { data, error } = await supabase()
    .from("tickets")
    .select(`
      *,
      clients(id, code, legal_name, phone, email, sector, nodo, service_status),
      ticket_categories(id, name, slug, color, sla_hours_critical, sla_hours_high, sla_hours_medium, sla_hours_low),
      assigned:profiles!tickets_assigned_to_fkey(id, full_name, email, avatar_url),
      creator:profiles!tickets_created_by_fkey(id, full_name)
    `)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTicketWithComments(id: string) {
  const ticket = await getTicket(id);

  const { data: comments, error } = await supabase()
    .from("ticket_comments")
    .select(`
      *,
      author:profiles!ticket_comments_author_id_fkey(id, full_name, avatar_url, role)
    `)
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return { ...ticket, comments: comments || [] };
}

export async function createTicket(ticket: any) {
  const code = await nextSequence("ticket");
  const { data, error } = await supabase()
    .from("tickets")
    .insert({ ...ticket, ticket_number: code })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTicket(id: string, updates: any) {
  const { data, error } = await supabase()
    .from("tickets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteTicket(id: string) {
  const { error } = await supabase()
    .from("tickets")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================
// TICKET COMMENTS
// ============================================
export async function addTicketComment(comment: {
  ticket_id: string;
  author_id?: string;
  content: string;
  is_internal?: boolean;
  comment_type?: string;
  old_value?: string;
  new_value?: string;
}) {
  const { data, error } = await supabase()
    .from("ticket_comments")
    .insert(comment)
    .select(`
      *,
      author:profiles!ticket_comments_author_id_fkey(id, full_name, avatar_url, role)
    `)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// TICKET STATS (for Centro de Comando)
// ============================================
export async function getTicketStats() {
  const { data: tickets, error } = await supabase()
    .from("tickets")
    .select("id, status, priority, sla_breached, created_at, resolved_at, assigned_to, category_id")
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);
  const all = tickets || [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const active = all.filter(t => !["resolved", "closed"].includes(t.status));
  const open = all.filter(t => t.status === "new" || t.status === "assigned");
  const inProgress = all.filter(t => t.status === "in_progress" || t.status === "waiting_client");
  const resolvedToday = all.filter(t => t.status === "resolved" && t.resolved_at && new Date(t.resolved_at) >= todayStart);
  const breached = all.filter(t => t.sla_breached && !["resolved", "closed"].includes(t.status));
  const critical = all.filter(t => t.priority === "critical" && !["resolved", "closed"].includes(t.status));

  // Resolved this month with resolution time
  const resolvedThisMonth = all.filter(t =>
    t.status === "resolved" && t.resolved_at && new Date(t.resolved_at) >= monthStart
  );
  let avgResolutionHours = 0;
  if (resolvedThisMonth.length > 0) {
    const totalHours = resolvedThisMonth.reduce((sum, t) => {
      const created = new Date(t.created_at).getTime();
      const resolved = new Date(t.resolved_at!).getTime();
      return sum + (resolved - created) / (1000 * 60 * 60);
    }, 0);
    avgResolutionHours = Math.round((totalHours / resolvedThisMonth.length) * 10) / 10;
  }

  // By category (active tickets only)
  const byCategory: Record<string, number> = {};
  for (const t of active) {
    const cat = t.category_id || "sin_categoria";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  // By assigned technician (active tickets only)
  const byAssigned: Record<string, number> = {};
  for (const t of active) {
    const tech = t.assigned_to || "sin_asignar";
    byAssigned[tech] = (byAssigned[tech] || 0) + 1;
  }

  return {
    total: all.length,
    open: open.length,
    in_progress: inProgress.length,
    resolved_today: resolvedToday.length,
    resolved_this_month: resolvedThisMonth.length,
    sla_breached: breached.length,
    critical_active: critical.length,
    active: active.length,
    avg_resolution_hours: avgResolutionHours,
    by_category: byCategory,
    by_assigned: byAssigned,
  };
}

export async function getTicketStatsEnriched() {
  const [stats, categories, technicians] = await Promise.all([
    getTicketStats(),
    getTicketCategories(),
    getTechnicians(),
  ]);

  // Map category IDs to names
  const catMap = new Map(categories.map((c: any) => [c.id, { name: c.name, color: c.color }]));
  const enrichedByCategory = Object.entries(stats.by_category).map(([id, count]) => ({
    id,
    name: catMap.get(id)?.name || "Sin categoría",
    color: catMap.get(id)?.color || "#6b7280",
    count,
  })).sort((a, b) => b.count - a.count);

  // Map technician IDs to names
  const techMap = new Map(technicians.map((t: any) => [t.id, t.full_name]));
  const enrichedByAssigned = Object.entries(stats.by_assigned).map(([id, count]) => ({
    id,
    name: techMap.get(id) || "Sin asignar",
    count,
  })).sort((a, b) => b.count - a.count);

  return {
    ...stats,
    by_category: enrichedByCategory,
    by_assigned: enrichedByAssigned,
  };
}

// ============================================
// TECHNICIANS LIST (profiles with soporte/tecnico role)
// ============================================
export async function getTechnicians() {
  const { data, error } = await supabase()
    .from("profiles")
    .select("id, full_name, email, role, avatar_url")
    .in("role", ["soporte", "tecnico", "infraestructura", "admin"])
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(error.message);
  return data || [];
}
