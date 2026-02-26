import { NextRequest, NextResponse } from "next/server";
import * as kommo from "@/lib/integrations/kommo-ventas";

// Cache pipelines in memory (refreshes on cold start)
let cachedPipelines: any[] | null = null;
let cachedPipelinesAt = 0;
const PIPELINE_CACHE_MS = 5 * 60 * 1000; // 5 min

async function loadPipelines(): Promise<any[]> {
  if (cachedPipelines && Date.now() - cachedPipelinesAt < PIPELINE_CACHE_MS) {
    return cachedPipelines;
  }
  const data = await kommo.getPipelines();
  const pipelines = data?._embedded?.pipelines || [];
  cachedPipelines = pipelines;
  cachedPipelinesAt = Date.now();
  return pipelines;
}

function mapStatusLabel(pipeline: any, statusId: number): string {
  const status = pipeline._embedded?.statuses?.find((s: any) => s.id === statusId);
  return status?.name || "Desconocido";
}

function mapStatusColor(pipeline: any, statusId: number): string {
  const status = pipeline._embedded?.statuses?.find((s: any) => s.id === statusId);
  return status?.color ? `#${status.color}` : "#6b7280";
}

export async function GET(request: NextRequest) {
  try {
    if (!kommo.isConfigured()) {
      return NextResponse.json({ error: "Kommo Ventas not configured", mock: true });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const pipelineFilter = searchParams.get("pipeline_id");

    // Parse period → timestamp boundary
    let fromTs: number | undefined;
    const now = Math.floor(Date.now() / 1000);
    switch (period) {
      case "today": {
        const td = new Date();
        td.setHours(0, 0, 0, 0);
        fromTs = Math.floor(td.getTime() / 1000);
        break;
      }
      case "7d":  fromTs = now - 7  * 86400; break;
      case "30d": fromTs = now - 30 * 86400; break;
      case "90d": fromTs = now - 90 * 86400; break;
      case "all": fromTs = undefined; break;
    }

    // Fetch pipelines + users + leads in parallel
    const [pipelines, usersData] = await Promise.all([
      loadPipelines(),
      kommo.getUsers(),
    ]);

    const users: { id: number; name: string; email: string }[] = (usersData?._embedded?.users || []).map((u: any) => ({
      id: u.id, name: u.name, email: u.email,
    }));
    const userMap = new Map<number, { id: number; name: string; email: string }>(users.map((u) => [u.id, u]));

    // Determine target pipeline(s)
    const targetPipelines = pipelineFilter
      ? pipelines.filter((p: any) => p.id === parseInt(pipelineFilter))
      : pipelines;

    // Fetch ALL leads (no API-level filter — Kommo's filter params are unreliable)
    const rawLeads = await kommo.getAllLeads();

    // === FILTER 1: By pipeline ===
    const targetPipelineIds = new Set(targetPipelines.map((p: any) => p.id));
    const pipelineFiltered = rawLeads.filter((l: any) => targetPipelineIds.has(l.pipeline_id));

    // All leads (no period filter — Kommo leads are cumulative, filtering by
    // date hides historical pipeline data). Period is used only for "created in period" metrics.
    const allLeads = pipelineFiltered;

    // Time boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime() / 1000;

    // Build pipeline summaries
    const pipelineSummaries = targetPipelines.map((pipeline: any) => {
      const pipelineLeads = allLeads.filter((l: any) => l.pipeline_id === pipeline.id);
      const statuses = pipeline._embedded?.statuses || [];

      // Won/Lost status IDs (Kommo convention: 142 = won, 143 = lost)
      const wonStatusId = 142;
      const lostStatusId = 143;

      const won = pipelineLeads.filter((l: any) => l.status_id === wonStatusId);
      const lost = pipelineLeads.filter((l: any) => l.status_id === lostStatusId);
      const active = pipelineLeads.filter((l: any) => l.status_id !== wonStatusId && l.status_id !== lostStatusId);
      const createdToday = pipelineLeads.filter((l: any) => l.created_at >= todayTs);

      const totalValue = active.reduce((s: number, l: any) => s + (l.price || 0), 0);
      const wonValue = won.reduce((s: number, l: any) => s + (l.price || 0), 0);

      // By stage
      const byStage = statuses
        .filter((s: any) => s.id !== wonStatusId && s.id !== lostStatusId)
        .map((status: any) => {
          const stageLeads = pipelineLeads.filter((l: any) => l.status_id === status.id);
          return {
            status_id: status.id,
            stage: status.name,
            color: status.color ? `#${status.color}` : "#6b7280",
            count: stageLeads.length,
            value: stageLeads.reduce((s: number, l: any) => s + (l.price || 0), 0),
            sort: status.sort,
          };
        })
        .sort((a: any, b: any) => a.sort - b.sort);

      return {
        id: pipeline.id,
        name: pipeline.name,
        total_leads: pipelineLeads.length,
        active_leads: active.length,
        won: won.length,
        lost: lost.length,
        created_today: createdToday.length,
        pipeline_value: totalValue,
        won_value: wonValue,
        conversion_rate: pipelineLeads.length > 0 ? Math.round((won.length / pipelineLeads.length) * 1000) / 10 : 0,
        by_stage: byStage,
      };
    });

    // By salesperson
    const salesMap = new Map<number, { total: number; won: number; lost: number; value: number; wonValue: number }>();
    for (const lead of allLeads) {
      const userId = lead.responsible_user_id;
      if (!userId) continue;
      const existing = salesMap.get(userId) || { total: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
      existing.total++;
      if (lead.status_id === 142) { existing.won++; existing.wonValue += (lead.price || 0); }
      else if (lead.status_id === 143) existing.lost++;
      else existing.value += (lead.price || 0);
      salesMap.set(userId, existing);
    }

    const bySalesperson = [...salesMap.entries()]
      .map(([userId, stats]) => ({
        id: userId,
        name: userMap.get(userId)?.name || `User ${userId}`,
        leads_total: stats.total,
        leads_won: stats.won,
        leads_lost: stats.lost,
        pipeline_value: stats.value,
        won_value: stats.wonValue,
        conversion_rate: stats.total > 0 ? Math.round((stats.won / stats.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.leads_won - a.leads_won);

    // Recent leads (last 20)
    const recentLeads = [...allLeads]
      .sort((a: any, b: any) => b.updated_at - a.updated_at)
      .slice(0, 20)
      .map((lead: any) => {
        const pipeline = pipelines.find((p: any) => p.id === lead.pipeline_id);
        const user = userMap.get(lead.responsible_user_id);
        const contactName = lead._embedded?.contacts?.[0]?.name || "";
        return {
          id: lead.id,
          name: lead.name || `Lead #${lead.id}`,
          contact_name: contactName,
          pipeline_name: pipeline?.name || "—",
          pipeline_id: lead.pipeline_id,
          status_label: pipeline ? mapStatusLabel(pipeline, lead.status_id) : "—",
          status_color: pipeline ? mapStatusColor(pipeline, lead.status_id) : "#6b7280",
          status_id: lead.status_id,
          responsible: user?.name || "Sin asignar",
          price: lead.price || 0,
          created_at: new Date(lead.created_at * 1000).toISOString(),
          updated_at: new Date(lead.updated_at * 1000).toISOString(),
          is_won: lead.status_id === 142,
          is_lost: lead.status_id === 143,
        };
      });

    // Global stats
    const totalActive = allLeads.filter((l: any) => l.status_id !== 142 && l.status_id !== 143).length;
    const totalWon = allLeads.filter((l: any) => l.status_id === 142).length;
    const totalLost = allLeads.filter((l: any) => l.status_id === 143).length;
    const totalValue = allLeads.filter((l: any) => l.status_id !== 142 && l.status_id !== 143).reduce((s: number, l: any) => s + (l.price || 0), 0);
    const totalWonValue = allLeads.filter((l: any) => l.status_id === 142).reduce((s: number, l: any) => s + (l.price || 0), 0);
    const createdToday = allLeads.filter((l: any) => l.created_at >= todayTs).length;
    const createdInPeriod = fromTs
      ? allLeads.filter((l: any) => l.created_at >= fromTs).length
      : allLeads.length;

    return NextResponse.json({
      source: "kommo-ventas",
      subdomain: "wuipidrive",
      period,

      // Global KPIs
      total_leads: allLeads.length,
      active_leads: totalActive,
      won: totalWon,
      lost: totalLost,
      created_today: createdToday,
      created_in_period: createdInPeriod,
      pipeline_value: totalValue,
      won_value: totalWonValue,
      conversion_rate: allLeads.length > 0 ? Math.round((totalWon / allLeads.length) * 1000) / 10 : 0,

      // Breakdowns
      pipelines: pipelineSummaries,
      by_salesperson: bySalesperson,
      recent_leads: recentLeads,

      // Meta
      available_pipelines: pipelines.map((p: any) => ({ id: p.id, name: p.name })),
      users,
      updated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Ventas API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch ventas data", source: "error" },
      { status: 500 }
    );
  }
}
