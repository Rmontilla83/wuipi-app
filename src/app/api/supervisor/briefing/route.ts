import { NextResponse } from "next/server";
import { apiServerError } from "@/lib/api-helpers";
import { generateBriefing, isAnyEngineConfigured } from "@/lib/ai/model-router";

export const dynamic = "force-dynamic";

const BRIEFING_SYSTEM_PROMPT = `Eres el Supervisor IA de Wuipi Telecomunicaciones, un ISP en Venezuela (Anzoategui).
Tu rol es ser un COO virtual que analiza datos operativos y genera insights accionables.

Analiza los datos proporcionados y genera un briefing ejecutivo en formato JSON con esta estructura exacta:
{
  "score": number (0-100, salud general del negocio basada en los datos disponibles),
  "score_trend": "stable" | "improving" | "declining",
  "kpis": {
    "salud_general": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "riesgo_operativo": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "eficiencia_soporte": { "value": string, "label": string, "trend": "up" | "down" | "stable" },
    "crecimiento": { "value": string, "label": string, "trend": "up" | "down" | "stable" }
  },
  "summary": string (parrafo ejecutivo de 3-4 oraciones, directo y accionable, en espanol),
  "insights": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "title": string (corto, max 60 chars),
      "description": string (1-2 oraciones explicando el hallazgo y recomendacion),
      "category": "infraestructura" | "soporte" | "ventas" | "clientes"
    }
  ]
}

Reglas:
- Se directo y accionable, no generico
- Si hay equipos caidos, menciona cuales y cuanto tiempo llevan
- Si hay tickets sin asignar o con SLA violado, senalalo como riesgo
- Correlaciona datos: si un nodo tiene muchos problemas Y muchos tickets, es un insight critico
- Los insights deben ser maximo 5, priorizados por impacto
- Si no hay datos de alguna fuente, no inventes — menciona que falta esa visibilidad
- Habla en espanol
- No uses emojis en el summary ni en las descripciones
- Se especifico con numeros y nombres de nodos/equipos
- Responde SOLO con el JSON, sin texto adicional ni backticks`;

export async function POST() {
  try {
    if (!isAnyEngineConfigured()) {
      return NextResponse.json(
        { error: "No hay modelo IA configurado. Agregar GEMINI_API_KEY o ANTHROPIC_API_KEY.", configured: false },
        { status: 503 }
      );
    }

    // 1. Gather business data
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    let businessData: any = {};
    try {
      const res = await fetch(`${baseUrl}/api/supervisor/data`, {
        cache: "no-store",
      });
      if (res.ok) businessData = await res.json();
    } catch (e) {
      console.error("[Supervisor] Error fetching business data:", e);
    }

    // 2. Build context
    const context = buildContext(businessData);

    // 3. Generate briefing (Gemini Flash preferred, Claude fallback)
    const { content: rawText, engine } = await generateBriefing(BRIEFING_SYSTEM_PROMPT, context);

    // 4. Parse JSON from response
    let briefing;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      briefing = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      console.error(`[Supervisor] Failed to parse ${engine} briefing JSON:`, rawText);
      return NextResponse.json(
        { error: `Error al parsear respuesta de ${engine}`, raw: rawText },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...briefing,
      generated_at: new Date().toISOString(),
      engine,
      sources: businessData.sources || {},
    });
  } catch (error) {
    return apiServerError(error);
  }
}

function buildContext(data: any): string {
  const parts: string[] = [];

  if (data.infra) {
    const i = data.infra;
    parts.push(`INFRAESTRUCTURA (Zabbix):
- ${i.totalHosts} hosts monitoreados: ${i.hostsUp} online, ${i.hostsDown} caidos, ${i.hostsUnknown} sin datos
- Health Score: ${i.healthScore}%
- Uptime: ${i.uptimePercent}%
- Problemas activos: ${i.totalProblems}
- Por severidad: ${JSON.stringify(i.problemsBySeverity)}
- Sitios: ${i.sites?.map((s: any) => `${s.code}: ${s.hostsUp}/${s.totalHosts} online${s.avgLatency ? `, latencia ${s.avgLatency}ms` : ""}`).join(" | ")}`);
  }

  if (data.problems?.length > 0) {
    const critical = data.problems.filter((p: any) => p.severity === "high" || p.severity === "disaster");
    if (critical.length > 0) {
      parts.push(`PROBLEMAS CRITICOS:
${critical.map((p: any) => `- [${p.severity}] ${p.name} en ${p.hostName} (${p.site}) — ${Math.round(p.duration / 60)} min`).join("\n")}`);
    }
    const warnings = data.problems.filter((p: any) => p.severity === "warning" || p.severity === "average");
    if (warnings.length > 0) {
      parts.push(`ADVERTENCIAS: ${warnings.length} warnings/average activos`);
    }
  }

  if (data.tickets) {
    const t = data.tickets;
    parts.push(`SOPORTE (Tickets):
- Total: ${t.total}, Abiertos: ${t.open}, En progreso: ${t.in_progress}
- Resueltos hoy: ${t.resolved_today}
- SLA violado: ${t.sla_breached}, Criticos activos: ${t.critical_active}
- Activos totales: ${t.active}`);
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

  if (data.nodes?.length > 0) {
    parts.push(`NODOS DE RED: ${data.nodes.map((n: any) => `${n.code} (${n.name})`).join(", ")}`);
  }

  const missing: string[] = [];
  if (!data.sources?.zabbix) missing.push("Zabbix (infraestructura)");
  if (!data.sources?.tickets) missing.push("Tickets (soporte)");
  if (!data.sources?.ventas) missing.push("CRM Ventas");
  if (!data.sources?.clients) missing.push("Base de clientes");
  if (missing.length > 0) {
    parts.push(`FUENTES NO DISPONIBLES: ${missing.join(", ")} — no se pueden analizar estos datos.`);
  }

  parts.push("NOTA: No hay conexion con Odoo (finanzas/facturacion). No hay datos de MRR, cobranza ni facturacion disponibles aun.");

  return parts.join("\n\n");
}
