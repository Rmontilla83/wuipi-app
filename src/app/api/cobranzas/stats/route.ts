import { createAdminSupabase } from "@/lib/supabase/server";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { COLLECTION_STAGES } from "@/lib/dal/crm-cobranzas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminSupabase();

    const { data: collections, error } = await supabase
      .from("crm_collections")
      .select("id, stage, amount_owed, days_overdue, recovered_at")
      .eq("is_deleted", false);

    if (error) throw new Error(error.message);
    const all = collections || [];

    // Group by stage
    const byStage: Record<string, { count: number; amount: number }> = {};
    for (const stage of COLLECTION_STAGES) {
      byStage[stage] = { count: 0, amount: 0 };
    }
    for (const c of all) {
      if (!byStage[c.stage]) byStage[c.stage] = { count: 0, amount: 0 };
      byStage[c.stage].count++;
      byStage[c.stage].amount += c.amount_owed || 0;
    }

    const active = all.filter(c =>
      !["recuperado", "retirado_definitivo"].includes(c.stage)
    );
    const recovered = all.filter(c => c.stage === "recuperado");
    const retired = all.filter(c => c.stage === "retirado_definitivo");

    // Recovery rate
    const totalClosed = recovered.length + retired.length;
    const recoveryRate = totalClosed > 0
      ? Math.round((recovered.length / totalClosed) * 100)
      : 0;

    return apiSuccess({
      total: all.length,
      active: active.length,
      recovered: recovered.length,
      retired: retired.length,
      recovery_rate: recoveryRate,
      active_amount: Math.round(active.reduce((s, c) => s + (c.amount_owed || 0), 0) * 100) / 100,
      by_stage: byStage,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
