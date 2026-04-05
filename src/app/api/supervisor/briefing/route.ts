import { NextResponse } from "next/server";
import { generateDualBriefing, isAnyEngineConfigured } from "@/lib/ai/model-router";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";
import { BUSINESS_RULES, getBillingCycleContext } from "@/lib/supervisor/business-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro: 60s for dual AI calls

// Step 1: Gemini Flash — Data analysis + anomaly detection
const GEMINI_PROMPT = `Eres un analista de datos de Wuipi Telecomunicaciones, un ISP en Venezuela.
Tu trabajo es analizar los datos operativos y producir un resumen estructurado con anomalias detectadas.

Analiza los datos y genera un JSON con esta estructura exacta:
{
  "score": number (0-100, salud general basada en datos),
  "score_trend": "stable" | "improving" | "declining",
  "areas": {
    "infraestructura": { "score": number, "resumen": string, "anomalias": [string] },
    "soporte": { "score": number, "resumen": string, "anomalias": [string] },
    "finanzas": { "score": number, "resumen": string, "anomalias": [string] },
    "ventas": { "score": number, "resumen": string, "anomalias": [string] },
    "cobranzas": { "score": number, "resumen": string, "anomalias": [string] }
  },
  "datos_clave": {
    "mrr_usd": number,
    "servicios_activos": number,
    "servicios_pausados": number,
    "tasa_cobranza_ved": number,
    "deuda_total_usd": number,
    "hosts_caidos": number,
    "tickets_activos": number,
    "leads_activos": number,
    "recovery_rate": number
  }
}

Reglas:
- Scores: infraestructura basado en uptime y problemas, soporte en tickets abiertos y SLA, finanzas en tasa cobranza y deuda, ventas en conversion y pipeline, cobranzas en recovery rate
- Anomalias: lista especifica con numeros, nombres de nodos/equipos, montos exactos
- Si tasa cobranza < 85%, es anomalia financiera
- Si hosts caidos > 0, listar cuales
- Si tickets sin atender > 10, es anomalia de soporte
- Si hay nodos con muchos servicios suspendidos (>20% del total), listarlos
- Responde SOLO con JSON, sin texto adicional ni backticks
- No inventes datos — si falta una fuente, pon score 50 y "datos no disponibles"`;

// Step 2: Claude — Correlation + strategic recommendations
const CLAUDE_PROMPT = `Eres el Supervisor IA de Wuipi Telecomunicaciones, un ISP en Venezuela (Anzoategui).
Tu rol es ser un CEO multidisciplinario virtual con vision constante en todas las areas del negocio.

Se te proporcionan dos cosas:
1. Un analisis previo generado por Gemini Flash con scores por area y anomalias detectadas
2. Los datos originales del negocio en tiempo real

Tu trabajo es ir mas alla del analisis numerico:
- CORRELACIONAR problemas entre areas (nodo con problemas + tickets + deuda = patron critico)
- PRIORIZAR que debe atenderse primero y por que
- RECOMENDAR acciones especificas para cada gerente (Operaciones, Finanzas, Comercial)
- DETECTAR riesgos que no son evidentes mirando un solo modulo

Genera un JSON con esta estructura exacta:
{
  "score": number (0-100, tu evaluacion como CEO — puede diferir del analisis previo si ves correlaciones),
  "score_trend": "stable" | "improving" | "declining",
  "kpis": {
    "salud_general": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "riesgo_operativo": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "eficiencia_soporte": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "crecimiento": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "salud_financiera": { "value": string, "label": string, "trend": "up" | "down" | "stable" }
  },
  "summary": string (parrafo ejecutivo de 3-4 oraciones como CEO hablando a los socios, directo y accionable),
  "insights": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "title": string (max 60 chars),
      "description": string (1-2 oraciones con hallazgo + recomendacion concreta),
      "category": "infraestructura" | "soporte" | "ventas" | "clientes" | "finanzas",
      "para": "operaciones" | "finanzas" | "comercial" | "todos"
    }
  ],
  "recomendaciones_por_area": {
    "operaciones": string (1-2 oraciones para el Gte. de Operaciones),
    "finanzas": string (1-2 oraciones para el Gte. de Finanzas),
    "comercial": string (1-2 oraciones para el Gte. Comercial)
  }
}

Reglas:
- Max 7 insights, priorizados por impacto real
- El campo "para" indica a que gerente va dirigido el insight
- Correlaciona: si un nodo tiene problemas Y sus clientes tienen deuda, es mas critico
- Si la tasa de cobranza es menor al 85%, es insight high o critical
- Habla como CEO — directo, con numeros, sin rodeos
- No uses emojis
- Responde SOLO con JSON, sin texto adicional ni backticks`;

// Single-engine fallback: outputs FINAL format directly (when only one engine available)
const SINGLE_PROMPT = `Eres el Supervisor IA de Wuipi Telecomunicaciones, un ISP en Venezuela (Anzoategui).
Tu rol es ser un CEO multidisciplinario virtual. Analiza los datos operativos y genera un briefing ejecutivo.

Genera un JSON con esta estructura exacta:
{
  "score": number (0-100, salud general del negocio),
  "score_trend": "stable" | "improving" | "declining",
  "kpis": {
    "salud_general": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "riesgo_operativo": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "eficiencia_soporte": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "crecimiento": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "salud_financiera": { "value": string, "label": string, "trend": "up" | "down" | "stable" }
  },
  "summary": string (parrafo ejecutivo de 3-4 oraciones, directo y accionable),
  "insights": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "title": string (max 60 chars),
      "description": string (1-2 oraciones con hallazgo y recomendacion),
      "category": "infraestructura" | "soporte" | "ventas" | "clientes" | "finanzas",
      "para": "operaciones" | "finanzas" | "comercial" | "todos"
    }
  ],
  "recomendaciones_por_area": {
    "operaciones": string,
    "finanzas": string,
    "comercial": string
  }
}

Reglas:
- Se directo, con numeros, sin rodeos
- Max 7 insights priorizados por impacto
- Correlaciona datos entre areas
- Si tasa cobranza < 85%, es insight high/critical
- No inventes datos — si falta una fuente, mencionalo
- Responde SOLO con JSON, sin texto adicional ni backticks`;

export async function POST() {
  try {
    if (!isAnyEngineConfigured()) {
      return NextResponse.json(
        { error: "No hay modelo IA configurado. Agregar GEMINI_API_KEY o ANTHROPIC_API_KEY.", configured: false },
        { status: 503 }
      );
    }

    // 1. Gather business data
    let businessData: any = {};
    try {
      businessData = await gatherBusinessData();
    } catch (e) {
      console.error("[Supervisor] Error gathering business data:", e);
    }

    // 2. Build context
    const context = buildContext(businessData);

    // 3. Generate dual briefing (Gemini analyzes → Claude correlates → fallback to single)
    const { content: rawText, engine, engines_used } = await generateDualBriefing(
      GEMINI_PROMPT,
      CLAUDE_PROMPT,
      SINGLE_PROMPT,
      context,
    );

    // 4. Parse JSON from response
    let briefing;
    try {
      briefing = JSON.parse(rawText);
    } catch {
      try {
        const cleaned = rawText
          .replace(/```(?:json)?\s*/gi, "")
          .replace(/```/g, "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, "")
          .trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        let jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, "$1");
        briefing = JSON.parse(jsonStr);
      } catch {
        console.error(`[Supervisor] Failed to parse ${engine} JSON. Raw:`, rawText.slice(0, 300));
        return NextResponse.json(
          { error: `Error al parsear respuesta de ${engine}. Respuesta: ${rawText.slice(0, 200)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ...briefing,
      generated_at: new Date().toISOString(),
      engine,
      engines_used,
      sources: businessData.sources || {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[Supervisor Briefing] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildContext(data: any): string {
  const parts: string[] = [];

  // Business rules and billing cycle context
  parts.push(BUSINESS_RULES);
  parts.push(`CONTEXTO TEMPORAL: ${getBillingCycleContext()}`);

  if (data.infra) {
    const i = data.infra;
    parts.push(`INFRAESTRUCTURA (Zabbix):
- ${i.totalHosts} hosts monitoreados: ${i.hostsUp} online, ${i.hostsDown} caidos, ${i.hostsUnknown} sin datos
- Health Score: ${i.healthScore}%
- Uptime: ${i.uptimePercent}%
- Problemas activos: ${i.totalProblems}
- Por severidad: ${JSON.stringify(i.problemsBySeverity)}
- Sitios: ${i.sites?.map((s: any) => `${s.code}: ${s.hostsUp}/${s.totalHosts} online${s.avgLatency ? `, lat ${s.avgLatency}ms` : ""}`).join(" | ")}`);
  }

  if (data.problems?.length > 0) {
    const critical = data.problems.filter((p: any) => p.severity === "high" || p.severity === "disaster");
    if (critical.length > 0) {
      parts.push(`PROBLEMAS CRITICOS:\n${critical.map((p: any) => `- [${p.severity}] ${p.name} en ${p.hostName} (${p.site}) — ${Math.round(p.duration / 60)} min`).join("\n")}`);
    }
    const warnings = data.problems.filter((p: any) => p.severity === "warning" || p.severity === "average");
    if (warnings.length > 0) {
      parts.push(`ADVERTENCIAS: ${warnings.length} warnings/average activos`);
    }
  }

  if (data.soporte) {
    const t = data.soporte;
    parts.push(`SOPORTE (Kommo — ultimos 30 dias):
- Total tickets: ${t.total}, Activos: ${t.active}, Nuevos sin atender: ${t.open}, En progreso: ${t.in_progress}
- Resueltos hoy: ${t.resolved_today}
- Razones de atencion: ${Object.entries(t.by_category || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  }

  if (data.leads) {
    const l = data.leads;
    parts.push(`VENTAS (CRM):
- Total leads: ${l.total}, Activos: ${l.active}, Ganados: ${l.won}, Perdidos: ${l.lost}
- Pipeline value: $${l.pipeline_value}
- Conversion: ${l.conversion_rate}%
- Creados esta semana: ${l.created_this_week}, este mes: ${l.created_this_month}
- Ganados este mes: ${l.won_this_month}
- Por etapa: ${JSON.stringify(l.by_stage)}`);
  }

  if (data.clients) {
    const c = data.clients;
    parts.push(`CLIENTES:
- Total: ${c.total}
- Por estado: ${JSON.stringify(c.by_status)}
- Por nodo: ${JSON.stringify(c.by_node)}
- Por tecnologia: ${JSON.stringify(c.by_technology)}`);
  }

  if (data.mikrotik_nodes?.length > 0) {
    const topNodes = data.mikrotik_nodes
      .filter((n: any) => n.services_active > 0)
      .slice(0, 15);
    parts.push(`NODOS MIKROTIK (servicios + MRR):
${topNodes.map((n: any) => `- ${n.name} (${n.router}): ${n.services_active} activos, ${n.services_suspended} susp, MRR $${n.mrr_usd}`).join("\n")}`);
  }

  if (data.cobranzas) {
    const cb = data.cobranzas;
    parts.push(`COBRANZAS:
- Total casos: ${cb.total}, Activos: ${cb.active}, Recuperados: ${cb.recovered}
- Monto activo: $${cb.active_amount}
- Recovery rate: ${cb.recovery_rate}%`);
  }

  if (data.finance) {
    const f = data.finance;
    const fp: string[] = ["FINANZAS (Odoo):"];

    if (f.exchange_rate) fp.push(`- Tasa BCV: Bs ${f.exchange_rate} / USD`);

    if (f.monthly) {
      fp.push(`- Facturacion del mes (${f.monthly.period}): Bs ${f.monthly.ved_invoiced.toLocaleString()} facturado, Bs ${f.monthly.ved_collected.toLocaleString()} cobrado (${f.monthly.ved_collection_rate}% tasa cobranza VED)`);
      fp.push(`- USD: $${f.monthly.usd_invoiced.toLocaleString()} facturado, $${f.monthly.usd_collected.toLocaleString()} cobrado (${f.monthly.usd_collection_rate}% tasa cobranza USD)`);
    }

    if (f.subscriptions) {
      fp.push(`- Servicios: ${f.subscriptions.active} activos, ${f.subscriptions.paused} pausados`);
      fp.push(`- MRR: $${f.subscriptions.mrr_usd.toLocaleString()} USD`);
    }

    if (f.accounts_receivable) {
      const ar = f.accounts_receivable;
      fp.push(`- Cartera pendiente: ${ar.total_customers_with_debt} clientes con deuda, total $${ar.total_pending_amount.toLocaleString()}`);
      if (ar.top_debtors?.length > 0) {
        fp.push(`- Top 10 morosos: ${ar.top_debtors.map((d: any) => `${d.name}: $${d.amount.toLocaleString()}`).join(" | ")}`);
      }
    }

    if (f.monthly_history?.length > 0) {
      fp.push(`- Efectividad historica: ${f.monthly_history.map((m: any) => `${m.label}: ${m.effectiveness}%`).join(", ")}`);
    }

    parts.push(fp.join("\n"));
  }

  const missing: string[] = [];
  if (!data.sources?.zabbix) missing.push("Zabbix (infraestructura)");
  if (!data.sources?.soporte) missing.push("Kommo (soporte)");
  if (!data.sources?.ventas) missing.push("CRM Ventas");
  if (!data.sources?.clients) missing.push("Base de clientes");
  if (!data.sources?.odoo) missing.push("Odoo (finanzas)");
  if (!data.sources?.cobranzas) missing.push("Cobranzas");
  if (missing.length > 0) {
    parts.push(`FUENTES NO DISPONIBLES: ${missing.join(", ")} — no se pueden analizar estos datos.`);
  }

  return parts.join("\n\n");
}
