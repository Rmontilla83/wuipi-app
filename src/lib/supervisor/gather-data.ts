// ============================================
// Supervisor — Business Data Gatherer
// ============================================
// Shared logic used by both /api/supervisor/data and
// /api/supervisor/briefing (direct call, no HTTP self-fetch)
// ============================================

import { getInfraOverview, getInfraProblems } from "@/lib/integrations/zabbix";
import { getLeadStats } from "@/lib/dal/crm-ventas";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  isOdooConfigured, getMonthlyInvoiceSummary, getSubscriptionSummary,
  getPendingByCustomer, getMikrotikNodes, getMonthlyHistory,
  getPaymentsByJournal, getExpensesSummary, getPlanDistribution,
} from "@/lib/integrations/odoo";
import { fetchBCVRate } from "@/lib/integrations/bcv";
import * as kommo from "@/lib/integrations/kommo";

export interface BusinessData {
  timestamp: string;
  sources: Record<string, boolean>;
  infra?: any;
  problems?: any[];
  soporte?: any;
  leads?: any;
  clients?: any;
  nodes?: any[];
  mikrotik_nodes?: any[];
  finance?: any;
  cobranzas?: any;
  payments_by_journal?: any[];
  expenses_month?: any;
  plan_distribution?: any[];
}

export async function gatherBusinessData(): Promise<BusinessData> {
  const result: BusinessData = {
    timestamp: new Date().toISOString(),
    sources: {},
  };

  const [infraRes, problemsRes, soporteRes, leadsRes, clientsRes, nodesRes, mikrotikRes, financeRes, cobranzasRes, paymentsRes, expensesRes, plansRes] =
    await Promise.allSettled([
      getInfraOverview(),
      getInfraProblems(),
      getSoporteFromKommo(),
      getLeadStats(),
      getClientCounts(),
      getNetworkNodesList(),
      getMikrotikNodesData(),
      getFinancialSnapshot(),
      getCobranzasSnapshot(),
      getPaymentsThisMonth(),
      getExpensesThisMonth(),
      getPlanDistributionData(),
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

  if (soporteRes.status === "fulfilled" && soporteRes.value) {
    result.soporte = soporteRes.value;
    result.sources.soporte = true;
  } else {
    result.sources.soporte = false;
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

  if (mikrotikRes.status === "fulfilled" && mikrotikRes.value) {
    result.mikrotik_nodes = mikrotikRes.value;
  }

  if (financeRes.status === "fulfilled") {
    result.finance = financeRes.value;
    result.sources.odoo = true;
  } else {
    result.sources.odoo = false;
  }

  if (cobranzasRes.status === "fulfilled") {
    result.cobranzas = cobranzasRes.value;
    result.sources.cobranzas = true;
  } else {
    result.sources.cobranzas = false;
  }

  if (paymentsRes.status === "fulfilled" && paymentsRes.value) {
    result.payments_by_journal = paymentsRes.value;
  }

  if (expensesRes.status === "fulfilled" && expensesRes.value) {
    result.expenses_month = expensesRes.value;
  }

  if (plansRes.status === "fulfilled" && plansRes.value) {
    result.plan_distribution = plansRes.value;
  }

  return result;
}

// ============================================
// Helpers
// ============================================

// Kommo soporte (real ticket data)
const PIPELINE_ID = 12115128;
const TIPO_FALLA_FIELD_ID = 2835796;
const TIPO_FALLA_MAP: Record<number, string> = {
  2258880: "Sin Servicio", 2258882: "Lentitud/Intermitencia", 2258884: "Red Interna",
  2368796: "Infraestructura", 2368798: "Gestión", 2371316: "Cableado", 2371318: "Cableado",
  2389698: "Desincorporación", 2390314: "Administrativo", 2391380: "Sin Servicio",
  2397107: "Bot/Reactivado", 2409076: "Sin Servicio", 2409078: "Visita L2C", 2409170: "Sin Servicio",
};
const STATUS_ATENDIDO = 142;
const STATUS_CERRADO = 143;
const STATUS_INCOMING = 93531348;

async function getSoporteFromKommo() {
  if (!kommo.isConfigured()) return null;

  const fromTs = Math.floor(Date.now() / 1000) - 30 * 86400;
  const leads = await kommo.getAllLeadsByPipeline(PIPELINE_ID, fromTs);
  if (!leads?.length) return { total: 0, active: 0, open: 0, in_progress: 0, resolved: 0, by_category: {} };

  const todayTs = new Date(); todayTs.setHours(0, 0, 0, 0);
  const todayStart = todayTs.getTime() / 1000;

  const active = leads.filter((l: any) => l.status_id !== STATUS_ATENDIDO && l.status_id !== STATUS_CERRADO);
  const open = leads.filter((l: any) => l.status_id === STATUS_INCOMING);
  const resolvedToday = leads.filter((l: any) => l.status_id === STATUS_ATENDIDO && l.closed_at && l.closed_at >= todayStart);

  // Category breakdown
  const byCategory: Record<string, number> = {};
  for (const lead of leads) {
    const field = lead.custom_fields_values?.find((cf: any) => cf.field_id === TIPO_FALLA_FIELD_ID);
    const enumId = field?.values?.[0]?.enum_id;
    const label = enumId ? (TIPO_FALLA_MAP[enumId] || "Sin clasificar") : "Sin clasificar";
    byCategory[label] = (byCategory[label] || 0) + 1;
  }

  // Unique clients (by contact_id)
  const uniqueContacts = new Set<number>();
  for (const lead of leads) {
    if (lead.contact_id) uniqueContacts.add(lead.contact_id);
  }

  return {
    total: leads.length,
    active: active.length,
    open: open.length,
    in_progress: active.length - open.length,
    resolved_today: resolvedToday.length,
    unique_clients: uniqueContacts.size,
    by_category: byCategory,
  };
}

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
  return { total: clients.length, by_status: byStatus, by_node: byNode, by_technology: byTech };
}

async function getFinancialSnapshot() {
  if (!isOdooConfigured()) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Get real BCV rate
  const bcvRate = await fetchBCVRate().catch(() => null);
  const rate = bcvRate?.usd_to_bs || undefined;

  const [invoiceSummary, subscriptions, pendingData, monthlyHistory] = await Promise.allSettled([
    getMonthlyInvoiceSummary(year, month),
    getSubscriptionSummary(),
    getPendingByCustomer({ bcvRate: rate }),
    getMonthlyHistory(3, rate),
  ]);

  const result: any = { exchange_rate: rate || null };

  if (invoiceSummary.status === "fulfilled") {
    const s = invoiceSummary.value;
    const vedRate = s.ved.invoiced > 0 ? Math.round((s.ved.collected / s.ved.invoiced) * 100) : 0;
    const usdRate = s.usd.invoiced > 0 ? Math.round((s.usd.collected / s.usd.invoiced) * 100) : 0;
    result.monthly = {
      ved_invoiced: s.ved.invoiced, ved_collected: s.ved.collected, ved_collection_rate: vedRate,
      usd_invoiced: s.usd.invoiced, usd_collected: s.usd.collected, usd_collection_rate: usdRate,
      period: `${year}-${String(month).padStart(2, "0")}`,
    };
  }

  if (subscriptions.status === "fulfilled") {
    result.subscriptions = subscriptions.value;
  }

  if (pendingData.status === "fulfilled") {
    const p = pendingData.value;

    // Aging buckets based on oldest_due_date
    const today = new Date();
    const aging = { current: { count: 0, amount: 0 }, days30: { count: 0, amount: 0 }, days60: { count: 0, amount: 0 }, days90: { count: 0, amount: 0 }, over90: { count: 0, amount: 0 } };
    for (const c of p.customers) {
      if (!c.oldest_due_date || c.total_due <= 0) continue;
      const dueDate = new Date(c.oldest_due_date);
      const days = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000));
      const bucket = days <= 0 ? "current" : days <= 30 ? "days30" : days <= 60 ? "days60" : days <= 90 ? "days90" : "over90";
      aging[bucket].count++;
      aging[bucket].amount += c.total_due;
    }
    // Round amounts
    for (const b of Object.values(aging)) b.amount = Math.round(b.amount * 100) / 100;

    result.accounts_receivable = {
      total_customers_with_debt: p.total_customers,
      total_pending_amount: Math.round(p.total_due * 100) / 100,
      aging,
      top_debtors: p.customers.slice(0, 10).map(c => ({
        name: c.customer_name, amount: c.total_due, oldest_invoice: c.oldest_due_date,
      })),
    };
  }

  if (monthlyHistory.status === "fulfilled") {
    result.monthly_history = monthlyHistory.value;
  }

  return result;
}

async function getMikrotikNodesData() {
  if (!isOdooConfigured()) return null;
  try {
    const nodes = await getMikrotikNodes();
    return nodes.map(n => ({
      name: n.name, router: n.router_name,
      services_active: n.services_active, services_suspended: n.services_suspended,
      mrr_usd: n.mrr_usd,
    }));
  } catch { return null; }
}

async function getCobranzasSnapshot() {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("crm_collections")
    .select("id, stage, amount_owed, days_overdue")
    .eq("is_deleted", false);
  if (error) throw new Error(error.message);
  const all = data || [];

  const active = all.filter(c => !["recuperado", "retirado_definitivo"].includes(c.stage));
  const recovered = all.filter(c => c.stage === "recuperado");
  return {
    total: all.length,
    active: active.length,
    recovered: recovered.length,
    active_amount: Math.round(active.reduce((s, c) => s + (c.amount_owed || 0), 0) * 100) / 100,
    recovery_rate: (recovered.length + all.filter(c => c.stage === "retirado_definitivo").length) > 0
      ? Math.round((recovered.length / (recovered.length + all.filter(c => c.stage === "retirado_definitivo").length)) * 100)
      : 0,
  };
}

async function getPaymentsThisMonth() {
  if (!isOdooConfigured()) return null;
  const now = new Date();
  return getPaymentsByJournal(now.getFullYear(), now.getMonth() + 1);
}

async function getExpensesThisMonth() {
  if (!isOdooConfigured()) return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const startDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const endMonth = m === 11 ? 0 : m + 1;
  const endYear = m === 11 ? y + 1 : y;
  const endDate = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;
  const ML: Record<number, string> = { 0:"Ene",1:"Feb",2:"Mar",3:"Abr",4:"May",5:"Jun",6:"Jul",7:"Ago",8:"Sep",9:"Oct",10:"Nov",11:"Dic" };
  return getExpensesSummary(startDate, endDate, `${ML[m]} ${y}`);
}

async function getPlanDistributionData() {
  if (!isOdooConfigured()) return null;
  try { return await getPlanDistribution(); } catch { return null; }
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
