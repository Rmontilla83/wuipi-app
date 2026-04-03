// ============================================
// Supervisor — Business Data Gatherer
// ============================================
// Shared logic used by both /api/supervisor/data and
// /api/supervisor/briefing (direct call, no HTTP self-fetch)
// ============================================

import { getInfraOverview, getInfraProblems } from "@/lib/integrations/zabbix";
import { getTicketStats } from "@/lib/dal/tickets";
import { getLeadStats } from "@/lib/dal/crm-ventas";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isOdooConfigured, getMonthlyInvoiceSummary, getSubscriptionSummary, getPendingByCustomer } from "@/lib/integrations/odoo";

export interface BusinessData {
  timestamp: string;
  sources: Record<string, boolean>;
  infra?: any;
  problems?: any[];
  tickets?: any;
  leads?: any;
  clients?: any;
  nodes?: any[];
  finance?: any;
}

export async function gatherBusinessData(): Promise<BusinessData> {
  const result: BusinessData = {
    timestamp: new Date().toISOString(),
    sources: {},
  };

  const [infraRes, problemsRes, ticketsRes, leadsRes, clientsRes, nodesRes, financeRes] =
    await Promise.allSettled([
      getInfraOverview(),
      getInfraProblems(),
      getTicketStats(),
      getLeadStats(),
      getClientCounts(),
      getNetworkNodesList(),
      getFinancialSnapshot(),
    ]);

  if (infraRes.status === "fulfilled") {
    result.infra = infraRes.value;
    result.sources.zabbix = true;
  } else {
    result.sources.zabbix = false;
  }

  if (problemsRes.status === "fulfilled") {
    result.problems = problemsRes.value;
  }

  if (ticketsRes.status === "fulfilled") {
    result.tickets = ticketsRes.value;
    result.sources.tickets = true;
  } else {
    result.sources.tickets = false;
  }

  if (leadsRes.status === "fulfilled") {
    result.leads = leadsRes.value;
    result.sources.ventas = true;
  } else {
    result.sources.ventas = false;
  }

  if (clientsRes.status === "fulfilled") {
    result.clients = clientsRes.value;
    result.sources.clients = true;
  } else {
    result.sources.clients = false;
  }

  if (nodesRes.status === "fulfilled") {
    result.nodes = nodesRes.value;
  }

  if (financeRes.status === "fulfilled") {
    result.finance = financeRes.value;
    result.sources.odoo = true;
  } else {
    result.sources.odoo = false;
  }

  return result;
}

// ============================================
// Helpers
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

async function getFinancialSnapshot() {
  if (!isOdooConfigured()) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [invoiceSummary, subscriptions, pendingData] = await Promise.allSettled([
    getMonthlyInvoiceSummary(year, month),
    getSubscriptionSummary(),
    getPendingByCustomer(),
  ]);

  const result: any = {};

  if (invoiceSummary.status === "fulfilled") {
    const s = invoiceSummary.value;
    const vedRate = s.ved.invoiced > 0 ? Math.round((s.ved.collected / s.ved.invoiced) * 100) : 0;
    const usdRate = s.usd.invoiced > 0 ? Math.round((s.usd.collected / s.usd.invoiced) * 100) : 0;
    result.monthly = {
      ved_invoiced: s.ved.invoiced,
      ved_collected: s.ved.collected,
      ved_collection_rate: vedRate,
      usd_invoiced: s.usd.invoiced,
      usd_collected: s.usd.collected,
      usd_collection_rate: usdRate,
      period: `${year}-${String(month).padStart(2, "0")}`,
    };
  }

  if (subscriptions.status === "fulfilled") {
    result.subscriptions = subscriptions.value;
  }

  if (pendingData.status === "fulfilled") {
    const p = pendingData.value;
    result.accounts_receivable = {
      total_customers_with_debt: p.total_customers,
      total_pending_amount: Math.round(p.total_due * 100) / 100,
      top_debtors: p.customers.slice(0, 10).map(c => ({
        name: c.customer_name,
        amount: c.total_due,
        oldest_invoice: c.oldest_due_date,
      })),
    };
  }

  return result;
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
