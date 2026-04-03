import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import {
  isOdooConfigured,
  getMonthlyInvoiceSummary,
  getSubscriptionSummary,
  getPendingByCustomer,
  getPlanDistribution,
  getMonthlyHistory,
} from "@/lib/integrations/odoo";
import { fetchBCVRate } from "@/lib/integrations/bcv";

export const dynamic = "force-dynamic";

// In-memory cache (2 minutes)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 2 * 60 * 1000;

export async function GET() {
  try {
    if (!isOdooConfigured()) {
      return apiError("Odoo no está configurado", 503);
    }

    // Return cached if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return apiSuccess(cache.data);
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Parallel fetch all data sources
    const [invoiceSummary, subscriptions, pendingData, planDist, bcvRate] = await Promise.all([
      getMonthlyInvoiceSummary(year, month),
      getSubscriptionSummary(),
      getPendingByCustomer(),
      getPlanDistribution(),
      fetchBCVRate().catch(() => null),
    ]);

    // Fetch history with BCV rate for VED→USD conversion
    const monthlyHistory = await getMonthlyHistory(6, bcvRate?.usd_to_bs || undefined);

    // Compute aging buckets from pending customers
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

      if (daysPast <= 15) {
        aging.bucket_0_15.count++;
        aging.bucket_0_15.total += c.total_due;
      } else if (daysPast <= 30) {
        aging.bucket_16_30.count++;
        aging.bucket_16_30.total += c.total_due;
      } else if (daysPast <= 60) {
        aging.bucket_31_60.count++;
        aging.bucket_31_60.total += c.total_due;
      } else {
        aging.bucket_60_plus.count++;
        aging.bucket_60_plus.total += c.total_due;
      }
    }

    // Round aging totals
    for (const bucket of Object.values(aging)) {
      bucket.total = Math.round(bucket.total * 100) / 100;
    }

    // Top 10 debtors (already sorted desc by getPendingByCustomer)
    const top_debtors = pendingData.customers.slice(0, 10).map((c) => ({
      partner_id: c.odoo_partner_id,
      name: c.customer_name,
      total_due: c.total_due,
      invoice_count: c.invoice_count,
      oldest_due_date: c.oldest_due_date,
      currency: c.currency,
    }));

    // Separate VED and USD overdue totals
    let overdue_total_ved = 0;
    let overdue_total_usd = 0;
    for (const c of pendingData.customers) {
      if (c.currency === "USD") overdue_total_usd += c.total_due;
      else overdue_total_ved += c.total_due;
    }

    const collRateVed = invoiceSummary.ved.invoiced > 0
      ? Math.round((invoiceSummary.ved.collected / invoiceSummary.ved.invoiced) * 1000) / 10
      : 0;
    const collRateUsd = invoiceSummary.usd.invoiced > 0
      ? Math.round((invoiceSummary.usd.collected / invoiceSummary.usd.invoiced) * 1000) / 10
      : 0;

    const result = {
      // Monthly invoicing
      invoiced_ved: invoiceSummary.ved.invoiced,
      collected_ved: invoiceSummary.ved.collected,
      invoices_count_ved: invoiceSummary.ved.count,
      collection_rate_ved: collRateVed,
      invoiced_usd: invoiceSummary.usd.invoiced,
      collected_usd: invoiceSummary.usd.collected,
      invoices_count_usd: invoiceSummary.usd.count,
      collection_rate_usd: collRateUsd,

      // Overdue
      overdue_count: pendingData.total_customers,
      overdue_total_ved: Math.round(overdue_total_ved * 100) / 100,
      overdue_total_usd: Math.round(overdue_total_usd * 100) / 100,

      // Subscriptions
      total_customers: pendingData.total_customers,
      active_subscriptions: subscriptions.active,
      paused_subscriptions: subscriptions.paused,
      mrr_usd: subscriptions.mrr_usd,

      // Aging & debtors
      aging,
      top_debtors,

      // Plan distribution
      plan_distribution: planDist,
      total_services: planDist.reduce((s, c) => s + c.total, 0),
      active_services: planDist.reduce((s, c) => s + c.active, 0),
      paused_services: planDist.reduce((s, c) => s + c.paused, 0),

      // Monthly history (drafts vs posted)
      monthly_history: monthlyHistory,

      // Exchange rate
      exchange_rate: bcvRate?.usd_to_bs ?? null,

      fetched_at: new Date().toISOString(),
    };

    cache = { data: result, ts: Date.now() };
    return apiSuccess(result);
  } catch (error) {
    return apiServerError(error);
  }
}
