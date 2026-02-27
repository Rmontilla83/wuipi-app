import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { getInfraOverview, getInfraProblems } from "@/lib/integrations/zabbix";
import { getTicketStats } from "@/lib/dal/tickets";
import { getLeadStats } from "@/lib/dal/crm-ventas";
import { createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, any> = {
    timestamp: new Date().toISOString(),
    sources: {} as Record<string, boolean>,
  };

  // Gather all data in parallel — partial failures OK
  const [infraRes, problemsRes, ticketsRes, leadsRes, clientsRes, nodesRes] =
    await Promise.allSettled([
      getInfraOverview(),
      getInfraProblems(),
      getTicketStats(),
      getLeadStats(),
      getClientCounts(),
      getNetworkNodesList(),
    ]);

  // Zabbix overview
  if (infraRes.status === "fulfilled") {
    result.infra = infraRes.value;
    result.sources.zabbix = true;
  } else {
    result.sources.zabbix = false;
  }

  // Zabbix problems
  if (problemsRes.status === "fulfilled") {
    result.problems = problemsRes.value;
  }

  // Tickets
  if (ticketsRes.status === "fulfilled") {
    result.tickets = ticketsRes.value;
    result.sources.tickets = true;
  } else {
    result.sources.tickets = false;
  }

  // Leads / ventas
  if (leadsRes.status === "fulfilled") {
    result.leads = leadsRes.value;
    result.sources.ventas = true;
  } else {
    result.sources.ventas = false;
  }

  // Clients
  if (clientsRes.status === "fulfilled") {
    result.clients = clientsRes.value;
    result.sources.clients = true;
  } else {
    result.sources.clients = false;
  }

  // Nodes
  if (nodesRes.status === "fulfilled") {
    result.nodes = nodesRes.value;
  }

  return apiSuccess(result);
}

// ============================================
// Helpers — direct Supabase queries
// ============================================

async function getClientCounts() {
  const supabase = createAdminSupabase();

  const { data: all, error } = await supabase
    .from("clients")
    .select("id, service_status, service_node_code, service_technology")
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);
  const clients = all || [];

  const byStatus: Record<string, number> = {};
  const byNode: Record<string, number> = {};
  const byTech: Record<string, number> = {};

  for (const c of clients) {
    byStatus[c.service_status || "unknown"] = (byStatus[c.service_status || "unknown"] || 0) + 1;
    if (c.service_node_code) byNode[c.service_node_code] = (byNode[c.service_node_code] || 0) + 1;
    if (c.service_technology) byTech[c.service_technology] = (byTech[c.service_technology] || 0) + 1;
  }

  return {
    total: clients.length,
    by_status: byStatus,
    by_node: byNode,
    by_technology: byTech,
  };
}

async function getNetworkNodesList() {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("network_nodes")
    .select("code, name, location, type")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data || [];
}
