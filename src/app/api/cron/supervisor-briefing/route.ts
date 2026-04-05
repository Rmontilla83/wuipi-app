import { NextRequest, NextResponse } from "next/server";
import { generateDualBriefing, isAnyEngineConfigured } from "@/lib/ai/model-router";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";
import { isConfigured as isTelegramConfigured, sendBriefingToAllChannels } from "@/lib/integrations/telegram";
import { BUSINESS_RULES, getBillingCycleContext } from "@/lib/supervisor/business-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro: dual AI + Telegram sends

// Reuse prompts from briefing route
const GEMINI_PROMPT = `Eres un analista de datos de Wuipi Telecomunicaciones, un ISP en Venezuela.
Analiza los datos y genera un JSON con esta estructura:
{
  "score": number (0-100), "score_trend": "stable"|"improving"|"declining",
  "areas": {
    "infraestructura": { "score": number, "resumen": string, "anomalias": [string] },
    "soporte": { "score": number, "resumen": string, "anomalias": [string] },
    "finanzas": { "score": number, "resumen": string, "anomalias": [string] },
    "ventas": { "score": number, "resumen": string, "anomalias": [string] },
    "cobranzas": { "score": number, "resumen": string, "anomalias": [string] }
  },
  "datos_clave": { "mrr_usd": number, "servicios_activos": number, "servicios_pausados": number, "tasa_cobranza_ved": number, "deuda_total_usd": number, "hosts_caidos": number, "tickets_activos": number, "leads_activos": number, "recovery_rate": number }
}
Responde SOLO con JSON.`;

const CLAUDE_PROMPT = `Eres el Supervisor IA de Wuipi Telecomunicaciones. Genera un JSON:
{
  "score": number (0-100), "score_trend": "stable"|"improving"|"declining",
  "kpis": {
    "salud_general": { "value": string, "label": string, "trend": "up"|"down"|"stable" },
    "riesgo_operativo": { "value": string, "label": string, "trend": "up"|"down"|"stable" },
    "eficiencia_soporte": { "value": string, "label": string, "trend": "up"|"down"|"stable" },
    "crecimiento": { "value": string, "label": string, "trend": "up"|"down"|"stable" },
    "salud_financiera": { "value": string, "label": string, "trend": "up"|"down"|"stable" }
  },
  "summary": string (3-4 oraciones como CEO),
  "insights": [{ "severity": "critical"|"high"|"medium"|"low", "title": string, "description": string, "category": "infraestructura"|"soporte"|"ventas"|"clientes"|"finanzas", "para": "operaciones"|"finanzas"|"comercial"|"todos" }],
  "recomendaciones_por_area": { "operaciones": string, "finanzas": string, "comercial": string }
}
Max 7 insights. Correlaciona entre areas. Responde SOLO con JSON.`;

const SINGLE_PROMPT = CLAUDE_PROMPT;

// Build context (same logic as briefing route)
function buildContext(data: any): string {
  const parts: string[] = [];

  parts.push(BUSINESS_RULES);
  parts.push(`CONTEXTO TEMPORAL: ${getBillingCycleContext()}`);

  if (data.infra) {
    const i = data.infra;
    parts.push(`INFRA: ${i.totalHosts} hosts, ${i.hostsUp} up, ${i.hostsDown} down. Health: ${i.healthScore}%. Problemas: ${i.totalProblems}. Severidad: ${JSON.stringify(i.problemsBySeverity)}`);
  }
  if (data.problems?.length > 0) {
    const critical = data.problems.filter((p: any) => p.severity === "high" || p.severity === "disaster");
    if (critical.length > 0) parts.push(`CRITICOS: ${critical.map((p: any) => `${p.hostName}[${p.severity}]: ${p.name} (${Math.round(p.duration / 60)}min)`).join("; ")}`);
  }
  if (data.soporte) {
    const t = data.soporte;
    parts.push(`SOPORTE(30d): ${t.total} total, ${t.active} activos, ${t.open} nuevos, resueltos hoy: ${t.resolved_today}. Razones: ${Object.entries(t.by_category || {}).map(([k, v]) => `${k}:${v}`).join(", ")}`);
  }
  if (data.leads) {
    const l = data.leads;
    parts.push(`VENTAS: ${l.total} leads, ${l.active} activos, pipeline $${l.pipeline_value}, conversion ${l.conversion_rate}%, ganados mes: ${l.won_this_month}`);
  }
  if (data.cobranzas) {
    const cb = data.cobranzas;
    parts.push(`COBRANZAS: ${cb.total} casos, ${cb.active} activos ($${cb.active_amount}), recovery ${cb.recovery_rate}%`);
  }
  if (data.mikrotik_nodes?.length > 0) {
    const top = data.mikrotik_nodes.filter((n: any) => n.services_active > 0).slice(0, 10);
    parts.push(`NODOS: ${top.map((n: any) => `${n.name}(${n.services_active}act/$${n.mrr_usd})`).join(", ")}`);
  }
  if (data.finance) {
    const f = data.finance;
    const fp: string[] = [];
    if (f.exchange_rate) fp.push(`BCV:Bs${f.exchange_rate}/USD`);
    if (f.monthly) fp.push(`Fact${f.monthly.period}: VED(${f.monthly.ved_collection_rate}%cob) USD(${f.monthly.usd_collection_rate}%cob)`);
    if (f.subscriptions) fp.push(`Serv:${f.subscriptions.active}act/${f.subscriptions.paused}pau MRR:$${f.subscriptions.mrr_usd}`);
    if (f.accounts_receivable) fp.push(`CxC:${f.accounts_receivable.total_customers_with_debt}clientes $${f.accounts_receivable.total_pending_amount}`);
    parts.push(`FINANZAS: ${fp.join(". ")}`);
  }
  return parts.join("\n");
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (Vercel sends this header for cron jobs)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAnyEngineConfigured()) {
      return NextResponse.json({ error: "No AI engine configured" }, { status: 503 });
    }

    if (!isTelegramConfigured()) {
      return NextResponse.json({ error: "Telegram not configured" }, { status: 503 });
    }

    console.log("[Cron] Starting daily supervisor briefing...");

    // 1. Gather data
    const businessData = await gatherBusinessData();
    const context = buildContext(businessData);

    // 2. Generate briefing
    const { content: rawText, engine, engines_used } = await generateDualBriefing(
      GEMINI_PROMPT, CLAUDE_PROMPT, SINGLE_PROMPT, context,
    );

    // 3. Parse JSON
    let briefing;
    try {
      briefing = JSON.parse(rawText);
    } catch {
      const cleaned = rawText.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      briefing = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    }

    briefing.engine = engine;
    briefing.engines_used = engines_used;
    briefing.generated_at = new Date().toISOString();
    briefing.sources = businessData.sources;

    // 4. Send to Telegram channels (pass raw data for detailed formatting)
    const { sent, failed } = await sendBriefingToAllChannels(briefing, businessData);

    console.log(`[Cron] Briefing sent to: ${sent.join(", ") || "none"}. Failed: ${failed.join(", ") || "none"}`);

    return NextResponse.json({
      ok: true,
      engine,
      engines_used,
      score: briefing.score,
      telegram: { sent, failed },
      generated_at: briefing.generated_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[Cron] Supervisor briefing error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
