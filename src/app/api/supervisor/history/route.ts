import { createAdminSupabase } from "@/lib/supabase/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const caller = await requirePermission("supervisor_ia", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 90);
    const date = searchParams.get("date"); // specific date YYYY-MM-DD

    const supabase = createAdminSupabase();

    let query = supabase
      .from("briefing_history")
      .select("id, score, score_trend, engine, engines_used, kpis, summary, insights, recomendaciones_por_area, sources, telegram_sent, telegram_failed, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (date) {
      query = query.gte("created_at", `${date}T00:00:00`).lt("created_at", `${date}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return apiSuccess({
      briefings: data || [],
      total: data?.length || 0,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
