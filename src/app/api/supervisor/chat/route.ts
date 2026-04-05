import { NextRequest, NextResponse } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { chatWithSupervisor, isAnyEngineConfigured } from "@/lib/ai/model-router";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";
import { BUSINESS_RULES, getBillingCycleContext } from "@/lib/supervisor/business-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro: 60s for AI + data gathering

export async function POST(request: NextRequest) {
  try {
    if (!isAnyEngineConfigured()) {
      return NextResponse.json(
        { content: "Supervisor IA no configurado. Agregar GEMINI_API_KEY o ANTHROPIC_API_KEY.", engine: "gemini" },
        { status: 503 }
      );
    }

    const { message, history } = await request.json();
    if (!message || typeof message !== "string") {
      return apiError("Message required", 400);
    }

    // 1. Gather business data
    let businessData: any = {};
    try {
      businessData = await gatherBusinessData();
    } catch (e) {
      console.error("[Supervisor Chat] Error gathering business data:", e);
    }

    // 2. Build system prompt with context
    const contextText = buildChatContext(businessData);

    const systemPrompt = `Eres el Supervisor IA de Wuipi Telecomunicaciones, un ISP en Venezuela (Anzoategui).
El usuario es el CEO/socio de la empresa.

${BUSINESS_RULES}

CONTEXTO TEMPORAL: ${getBillingCycleContext()}

Tienes acceso a datos en tiempo real de:
- Infraestructura de red (Zabbix): estado de equipos, problemas, latencia
- Soporte (Kommo CRM): tickets reales, razones de atencion, carga por tecnico
- Ventas (CRM): leads, pipeline, conversiones
- Finanzas (Odoo): facturacion, cobranza, MRR, cartera pendiente, morosos
- Cobranzas: casos activos, recovery rate, montos en gestion
- Servicios Mikrotik: MRR por nodo, servicios activos/suspendidos

Datos actuales del negocio:
${contextText}

Responde como un CEO multidisciplinario — directo, con numeros, accionable.
Si te preguntan algo que no tienes datos para responder, dilo honestamente.
No inventes datos. Puedes hacer recomendaciones basadas en los datos disponibles.
Cuando des recomendaciones, indica a que gerente va dirigida (Operaciones, Finanzas, Comercial).
Formatea con markdown basico (bold, listas) para legibilidad.
Responde en espanol.`;

    // 3. Route to best model
    const { content, engine } = await chatWithSupervisor(systemPrompt, message, history || []);

    return NextResponse.json({ content, engine });
  } catch (error) {
    console.error("[Supervisor Chat] Error:", error);
    return apiServerError(error);
  }
}

function buildChatContext(data: any): string {
  const parts: string[] = [];

  if (data.infra) {
    const i = data.infra;
    parts.push(`INFRAESTRUCTURA: ${i.totalHosts} hosts, ${i.hostsUp} online, ${i.hostsDown} caidos. Health: ${i.healthScore}%. Problemas: ${i.totalProblems}. Sitios: ${i.sites?.map((s: any) => `${s.code}(${s.hostsUp}/${s.totalHosts}${s.avgLatency ? ` lat:${s.avgLatency}ms` : ""})`).join(", ")}`);
  }

  if (data.problems?.length > 0) {
    const top = data.problems.slice(0, 10);
    parts.push(`PROBLEMAS ACTIVOS: ${top.map((p: any) => `${p.hostName}[${p.severity}]: ${p.name} (${Math.round(p.duration / 60)}min)`).join("; ")}`);
  }

  if (data.soporte) {
    const t = data.soporte;
    parts.push(`SOPORTE (Kommo 30d): ${t.total} tickets, ${t.active} activos, ${t.open} nuevos, ${t.in_progress} progreso, resueltos hoy: ${t.resolved_today}. Razones: ${Object.entries(t.by_category || {}).map(([k, v]) => `${k}:${v}`).join(", ")}`);
  }

  if (data.leads) {
    const l = data.leads;
    parts.push(`VENTAS: ${l.total} leads, ${l.active} activos, ${l.won} ganados, pipeline $${l.pipeline_value}, conversion ${l.conversion_rate}%, ${l.created_this_week} esta semana`);
  }

  if (data.clients) {
    parts.push(`CLIENTES: ${data.clients.total} total. Estado: ${JSON.stringify(data.clients.by_status)}`);
  }

  if (data.mikrotik_nodes?.length > 0) {
    const top = data.mikrotik_nodes.filter((n: any) => n.services_active > 0).slice(0, 10);
    parts.push(`NODOS MK: ${top.map((n: any) => `${n.name}(${n.services_active}act/$${n.mrr_usd})`).join(", ")}`);
  }

  if (data.cobranzas) {
    const cb = data.cobranzas;
    parts.push(`COBRANZAS: ${cb.total} casos, ${cb.active} activos ($${cb.active_amount}), recovery ${cb.recovery_rate}%`);
  }

  if (data.finance) {
    const f = data.finance;
    const fp: string[] = [];
    if (f.exchange_rate) fp.push(`BCV: Bs${f.exchange_rate}/USD`);
    if (f.monthly) {
      fp.push(`Fact ${f.monthly.period}: VED Bs${f.monthly.ved_invoiced.toLocaleString()} (${f.monthly.ved_collection_rate}% cobrado), USD $${f.monthly.usd_invoiced.toLocaleString()} (${f.monthly.usd_collection_rate}% cobrado)`);
    }
    if (f.subscriptions) {
      fp.push(`Servicios: ${f.subscriptions.active} act, ${f.subscriptions.paused} pau, MRR $${f.subscriptions.mrr_usd.toLocaleString()}`);
    }
    if (f.accounts_receivable) {
      fp.push(`Cartera: ${f.accounts_receivable.total_customers_with_debt} con deuda, $${f.accounts_receivable.total_pending_amount.toLocaleString()}`);
      if (f.accounts_receivable.top_debtors?.length > 0) {
        fp.push(`Top morosos: ${f.accounts_receivable.top_debtors.slice(0, 5).map((d: any) => `${d.name}($${d.amount})`).join(", ")}`);
      }
    }
    parts.push(`FINANZAS: ${fp.join(". ")}`);
  }

  if (!data.sources?.zabbix) parts.push("NOTA: Zabbix no disponible");
  if (!data.sources?.soporte) parts.push("NOTA: Kommo (soporte) no disponible");
  if (!data.sources?.odoo) parts.push("NOTA: Odoo (finanzas) no disponible");

  return parts.join("\n");
}
