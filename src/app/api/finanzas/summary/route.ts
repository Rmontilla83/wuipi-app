import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getExpensesSummary,
  getSubscriptionSummary,
  getMonthlyHistory,
  isOdooConfigured,
} from "@/lib/integrations/odoo";
import { fetchBCVRate } from "@/lib/integrations/bcv";
import { apiError, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Server-side cache (5 min)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return apiError("No autenticado", 401);

    if (!isOdooConfigured()) {
      return apiError("Odoo no configurado", 503);
    }

    // Check cache
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    const yearParam = request.nextUrl.searchParams.get("year");
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

    // Fetch all data in parallel
    const [expenses, subscriptions, monthlyHistory, bcvRate] = await Promise.allSettled([
      getExpensesSummary(year),
      getSubscriptionSummary(),
      getMonthlyHistory(6),
      fetchBCVRate(),
    ]);

    const expensesData = expenses.status === "fulfilled" ? expenses.value : null;
    const subsData = subscriptions.status === "fulfilled" ? subscriptions.value : null;
    const historyData = monthlyHistory.status === "fulfilled" ? monthlyHistory.value : [];
    const bcv = bcvRate.status === "fulfilled" ? bcvRate.value : null;

    // Build P&L summary
    const mrr_usd = subsData?.mrr_usd || 0;
    const annual_revenue_est = mrr_usd * 12;
    const total_expenses_usd = expensesData?.total_usd || 0;

    // Monthly avg expenses for comparison
    const monthCount = expensesData?.by_month?.length || 1;
    const avg_monthly_expense = total_expenses_usd / monthCount;

    const result = {
      year,
      bcv_rate: bcv?.usd_to_bs || expensesData?.bcv_rate_current || 0,
      pnl: {
        mrr_usd,
        annual_revenue_est,
        total_expenses_usd,
        avg_monthly_expense: Math.round(avg_monthly_expense * 100) / 100,
        net_margin_usd: Math.round((mrr_usd - avg_monthly_expense) * 100) / 100,
        margin_pct: mrr_usd > 0 ? Math.round(((mrr_usd - avg_monthly_expense) / mrr_usd) * 10000) / 100 : 0,
      },
      expenses: expensesData,
      income: {
        subscriptions: subsData,
        monthly_history: historyData,
      },
    };

    cache = { data: result, ts: Date.now() };

    return NextResponse.json(result);
  } catch (error) {
    return apiServerError(error);
  }
}
