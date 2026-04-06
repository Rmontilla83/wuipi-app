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

// Server-side cache keyed by date range (5 min per key)
const cacheMap = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return apiError("No autenticado", 401);

    if (!isOdooConfigured()) {
      return apiError("Odoo no configurado", 503);
    }

    // Parse date range params
    const params = request.nextUrl.searchParams;
    const now = new Date();
    const year = now.getFullYear();
    const from = params.get("from") || `${year}-01-01`;
    const to = params.get("to") || `${year + 1}-01-01`;
    const label = params.get("label") || String(year);

    // Check cache
    const cacheKey = `${from}|${to}`;
    const cached = cacheMap.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // Fetch all data in parallel
    const [expenses, subscriptions, monthlyHistory, bcvRate] = await Promise.allSettled([
      getExpensesSummary(from, to, label),
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
    const total_expenses_usd = expensesData?.total_usd || 0;

    // Monthly avg expenses for comparison
    const monthCount = expensesData?.by_month?.length || 1;
    const avg_monthly_expense = total_expenses_usd / monthCount;

    const result = {
      from,
      to,
      label,
      bcv_rate: bcv?.usd_to_bs || expensesData?.bcv_rate_current || 0,
      pnl: {
        mrr_usd,
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

    // Store in cache (keep max 5 keys)
    if (cacheMap.size > 5) {
      const oldest = [...cacheMap.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) cacheMap.delete(oldest[0]);
    }
    cacheMap.set(cacheKey, { data: result, ts: Date.now() });

    return NextResponse.json(result);
  } catch (error) {
    return apiServerError(error);
  }
}
