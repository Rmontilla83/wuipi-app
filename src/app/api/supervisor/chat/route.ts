import { NextRequest, NextResponse } from "next/server";
import { apiError, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { content: "Supervisor IA no configurado. Agregar ANTHROPIC_API_KEY.", engine: "claude" },
        { status: 503 }
      );
    }

    const { message, history } = await request.json();
    if (!message || typeof message !== "string") {
      return apiError("Message required", 400);
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
      console.error("[Supervisor Chat] Error fetching business data:", e);
    }

    // 2. Build context
    const contextText = buildChatContext(businessData);

    const systemPrompt = `Eres el Supervisor IA de Wuipi Telecomunicaciones, un ISP en Venezuela (Anzoategui).
El usuario es el gerente/dueno de la empresa. Tienes acceso a datos en tiempo real de:
- Infraestructura de red (Zabbix): estado de equipos, problemas, latencia
- Soporte (tickets): tickets abiertos, prioridades, tiempos de resolucion
- Ventas (CRM): leads, pipeline, conversiones
- Clientes: base de clientes, distribucion por nodo y tecnologia

Datos actuales del negocio:
${contextText}

Responde en español, se directo y especifico con numeros.
Si te preguntan algo que no tienes datos para responder (ej: finanzas detalladas, Odoo no esta conectado aun), dilo honestamente.
No inventes datos.
Puedes hacer recomendaciones basadas en los datos disponibles.
Formatea con markdown basico (bold, listas) para legibilidad.`;

    // 3. Build messages array with history
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (history?.length) {
      for (const msg of history.slice(-10)) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }
    messages.push({ role: "user", content: message });

    // 4. Call Claude
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    });

    const content = (response.content as any[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return NextResponse.json({ content, engine: "claude" });
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

  if (data.tickets) {
    const t = data.tickets;
    parts.push(`SOPORTE: ${t.total} tickets total, ${t.open} abiertos, ${t.in_progress} en progreso, ${t.sla_breached} SLA violado, ${t.critical_active} criticos`);
  }

  if (data.leads) {
    const l = data.leads;
    parts.push(`VENTAS: ${l.total} leads, ${l.active} activos, ${l.won} ganados, pipeline $${l.pipeline_value}, conversion ${l.conversion_rate}%, ${l.created_this_week} esta semana`);
  }

  if (data.clients) {
    const c = data.clients;
    parts.push(`CLIENTES: ${c.total} total. Estado: ${JSON.stringify(c.by_status)}. Nodos: ${JSON.stringify(c.by_node)}. Tech: ${JSON.stringify(c.by_technology)}`);
  }

  if (data.nodes?.length > 0) {
    parts.push(`NODOS: ${data.nodes.map((n: any) => `${n.code}(${n.name})`).join(", ")}`);
  }

  if (!data.sources?.zabbix) parts.push("NOTA: Zabbix no disponible");
  if (!data.sources?.tickets) parts.push("NOTA: Tickets no disponibles");
  parts.push("NOTA: Odoo (finanzas/facturacion) no conectado aun — no hay datos de MRR/cobranza.");

  return parts.join("\n");
}
