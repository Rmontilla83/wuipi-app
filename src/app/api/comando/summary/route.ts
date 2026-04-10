import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { getInfraOverview, getInfraProblems, getInfraHosts } from "@/lib/integrations/zabbix";
import {
  isOdooConfigured, getMonthlyInvoiceSummary, getSubscriptionSummary,
  getPendingByCustomer, getPlanDistribution, getMonthlyHistory,
  getPaymentsByJournal, getMikrotikNodes,
} from "@/lib/integrations/odoo";
import { fetchBCVRate } from "@/lib/integrations/bcv";
import { getTicketStatsEnriched } from "@/lib/dal/tickets";
import { getLeadStats } from "@/lib/dal/crm-ventas";
import { createAdminSupabase } from "@/lib/supabase/server";
import { COLLECTION_STAGES } from "@/lib/dal/crm-cobranzas";
import * as kommo from "@/lib/integrations/kommo";
import type { InfraOverview } from "@/types/zabbix";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// In-memory cache (2 minutes)
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export async function GET() {
  try {
    const caller = await requirePermission("comando", "access");
    if (!caller) return apiError("Sin permisos", 403);

    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return apiSuccess(cache.data);
    }

    // All data sources in parallel using allSettled (partial failure OK)
    const [
      financeRes, infraRes, problemsRes, hostsRes,
      ticketsRes, soporteRes, ventasRes, cobranzasRes, nodesRes,
    ] = await Promise.allSettled([
      fetchFinanceData(),
      getInfraOverview(),
      getInfraProblems(),
      getInfraHosts(),
      getTicketStatsEnriched(),
      fetchSoporteData(),
      getLeadStats(),
      fetchCobranzasStats(),
      isOdooConfigured() ? getMikrotikNodes() : Promise.resolve([]),
    ]);

    const infraFallback: InfraOverview = {
      totalHosts: 0, hostsUp: 0, hostsDown: 0, hostsUnknown: 0,
      uptimePercent: 0,
      problemsBySeverity: { not_classified: 0, information: 0, warning: 0, average: 0, high: 0, disaster: 0 },
      healthScore: 0, totalProblems: 0, sites: [], zabbixConnected: false,
      updatedAt: new Date().toISOString(),
    };

    const result = {
      finance: financeRes.status === "fulfilled" ? financeRes.value : null,
      infra: infraRes.status === "fulfilled" ? infraRes.value : infraFallback,
      problems: problemsRes.status === "fulfilled" ? problemsRes.value : [],
      hosts: hostsRes.status === "fulfilled" ? hostsRes.value : [],
      tickets: ticketsRes.status === "fulfilled" ? ticketsRes.value : null,
      soporte: soporteRes.status === "fulfilled" ? soporteRes.value : null,
      ventas: ventasRes.status === "fulfilled" ? ventasRes.value : null,
      cobranzas: cobranzasRes.status === "fulfilled" ? cobranzasRes.value : null,
      nodes: nodesRes.status === "fulfilled" ? nodesRes.value : [],
      fetched_at: new Date().toISOString(),
    };

    cache = { data: result, ts: Date.now() };
    return apiSuccess(result);
  } catch (error) {
    return apiServerError(error);
  }
}

// --- Helpers that mirror existing endpoint logic ---

async function fetchFinanceData() {
  if (!isOdooConfigured()) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  const bcvRate = await fetchBCVRate().catch(() => null);
  const rate = bcvRate?.usd_to_bs || undefined;

  const [invoiceSummary, prevInvoiceSummary, subscriptions, pendingData, planDist, monthlyHistory, paymentsByJournal] = await Promise.all([
    getMonthlyInvoiceSummary(year, month),
    getMonthlyInvoiceSummary(prevYear, prevMonth),
    getSubscriptionSummary(),
    getPendingByCustomer({ bcvRate: rate }),
    getPlanDistribution(),
    getMonthlyHistory(6, rate),
    getPaymentsByJournal(year, month),
  ]);

  const today = new Date();
  const aging = {
    bucket_0_15: { count: 0, total: 0 },
    bucket_16_30: { count: 0, total: 0 },
    bucket_31_60: { count: 0, total: 0 },
    bucket_60_plus: { count: 0, total: 0 },
  };

  for (const c of pendingData.customers) {
    if (!c.oldest_due_date) continue;
    const dueDate = new Date(c.oldest_due_date);
    const daysPast = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysPast <= 15) { aging.bucket_0_15.count++; aging.bucket_0_15.total += c.total_due; }
    else if (daysPast <= 30) { aging.bucket_16_30.count++; aging.bucket_16_30.total += c.total_due; }
    else if (daysPast <= 60) { aging.bucket_31_60.count++; aging.bucket_31_60.total += c.total_due; }
    else { aging.bucket_60_plus.count++; aging.bucket_60_plus.total += c.total_due; }
  }
  for (const bucket of Object.values(aging)) { bucket.total = Math.round(bucket.total * 100) / 100; }

  const top_debtors = pendingData.customers.slice(0, 10).map((c) => ({
    partner_id: c.odoo_partner_id,
    name: c.customer_name,
    total_due: c.total_due,
    invoice_count: c.invoice_count,
    oldest_due_date: c.oldest_due_date,
    currency: c.currency,
  }));

  let overdue_total_ved = 0, overdue_total_usd = 0;
  for (const c of pendingData.customers) {
    if (c.currency === "USD") overdue_total_usd += c.total_due;
    else overdue_total_ved += c.total_due;
  }

  const collRateVed = invoiceSummary.ved.invoiced > 0
    ? Math.round((invoiceSummary.ved.collected / invoiceSummary.ved.invoiced) * 1000) / 10 : 0;
  const collRateUsd = invoiceSummary.usd.invoiced > 0
    ? Math.round((invoiceSummary.usd.collected / invoiceSummary.usd.invoiced) * 1000) / 10 : 0;

  return {
    invoiced_ved: invoiceSummary.ved.invoiced,
    collected_ved: invoiceSummary.ved.collected,
    invoices_count_ved: invoiceSummary.ved.count,
    collection_rate_ved: collRateVed,
    invoiced_usd: invoiceSummary.usd.invoiced,
    collected_usd: invoiceSummary.usd.collected,
    invoices_count_usd: invoiceSummary.usd.count,
    collection_rate_usd: collRateUsd,
    overdue_count: pendingData.total_customers,
    overdue_total_ved: Math.round(overdue_total_ved * 100) / 100,
    overdue_total_usd: Math.round(overdue_total_usd * 100) / 100,
    total_customers: pendingData.total_customers,
    active_subscriptions: subscriptions.active,
    paused_subscriptions: subscriptions.paused,
    mrr_usd: subscriptions.mrr_usd,
    aging, top_debtors,
    plan_distribution: planDist,
    total_services: planDist.reduce((s, c) => s + c.total, 0),
    active_services: planDist.reduce((s, c) => s + c.active, 0),
    paused_services: planDist.reduce((s, c) => s + c.paused, 0),
    monthly_history: monthlyHistory,
    payments_by_journal: paymentsByJournal,
    prev_collected_ved: prevInvoiceSummary.ved.collected,
    prev_collected_usd: prevInvoiceSummary.usd.collected,
    prev_invoiced_ved: prevInvoiceSummary.ved.invoiced,
    exchange_rate: bcvRate?.usd_to_bs ?? null,
  };
}

async function fetchSoporteData() {
  // Simplified soporte stats for comando overview (30d period)
  const leads = await kommo.getLeadsByPipeline(12115128);
  const now = Date.now();
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const recent = leads.filter((l: { created_at?: number }) => {
    const created = l.created_at ? l.created_at * 1000 : 0;
    return now - created < ms30d;
  });
  const open = recent.filter((l: { status_id: number }) => ![142, 143].includes(l.status_id)).length;
  return { total_leads: recent.length, tickets_open: open };
}

async function fetchCobranzasStats() {
  const supabase = createAdminSupabase();
  const { data: collections, error } = await supabase
    .from("crm_collections")
    .select("id, stage, amount_owed, days_overdue, recovered_at")
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);
  const all = collections || [];

  const byStage: Record<string, { count: number; amount: number }> = {};
  for (const stage of COLLECTION_STAGES) { byStage[stage] = { count: 0, amount: 0 }; }
  for (const c of all) {
    if (!byStage[c.stage]) byStage[c.stage] = { count: 0, amount: 0 };
    byStage[c.stage].count++;
    byStage[c.stage].amount += c.amount_owed || 0;
  }

  const active = all.filter(c => !["recuperado", "retirado_definitivo"].includes(c.stage));
  const recovered = all.filter(c => c.stage === "recuperado");
  const retired = all.filter(c => c.stage === "retirado_definitivo");
  const totalClosed = recovered.length + retired.length;

  return {
    total: all.length,
    active: active.length,
    recovered: recovered.length,
    retired: retired.length,
    recovery_rate: totalClosed > 0 ? Math.round((recovered.length / totalClosed) * 100) : 0,
    active_amount: Math.round(active.reduce((s, c) => s + (c.amount_owed || 0), 0) * 100) / 100,
    by_stage: byStage,
  };
}
