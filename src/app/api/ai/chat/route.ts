import { NextRequest, NextResponse } from "next/server";
import { queryAI, isConfigured } from "@/lib/ai/orchestrator";

// Gather context from all modules (only when AI is configured)
async function gatherContext(request: NextRequest): Promise<string> {
  try {
    const cookie = request.headers.get("cookie") || "";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wuipi-app.vercel.app";
    
    const headers = { cookie };
    const [infraRes, soporteRes, finanzasRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/infraestructura`, { headers }).then(r => r.json()),
      fetch(`${baseUrl}/api/soporte`, { headers }).then(r => r.json()),
      fetch(`${baseUrl}/api/finanzas`, { headers }).then(r => r.json()),
    ]);

    const parts: string[] = [];

    if (infraRes.status === "fulfilled") {
      const d = infraRes.value;
      parts.push(`INFRAESTRUCTURA: ${d.total_devices} dispositivos, ${d.sensors_up}/${d.total_sensors} sensores OK, health score: ${d.health_score}/100. Alertas: ${d.alerts?.length || 0}.`);
    }
    if (soporteRes.status === "fulfilled") {
      const d = soporteRes.value;
      parts.push(`SOPORTE: ${d.tickets_today} tickets hoy, ${d.tickets_open} abiertos. SLA: ${d.sla?.compliance_rate}%. Reincidentes: ${d.repeat_clients} (${d.repeat_client_pct}%).`);
    }
    if (finanzasRes.status === "fulfilled") {
      const d = finanzasRes.value;
      parts.push(`FINANZAS: MRR $${d.revenue?.mrr} (+${d.revenue?.mrr_growth}%), cobranza ${d.collections?.collection_rate}%, morosos: ${d.total_debtors}.`);
    }

    return parts.length > 0
      ? `DATOS ACTUALES DE WUIPI (${new Date().toLocaleString("es-VE")}):\n${parts.join("\n")}`
      : "";
  } catch {
    return "";
  }
}

// Mock responses when no AI is configured
function getMockResponse(query: string): { content: string; engine: "claude" | "gemini" } {
  const lower = query.toLowerCase();

  if (lower.includes("norte") || lower.includes("lechería") || lower.includes("zona")) {
    return { engine: "claude", content: "**Estado Zona Norte — Análisis en Tiempo Real**\n\nEl OLT Lechería-Norte opera en estado degradado con latencia de 152ms (umbral: 100ms) y packet loss de 8.2%.\n\n**Impacto cruzado:**\n- 42 tickets esta semana desde esta zona (vs promedio 18)\n- 14 clientes reincidentes — señal de problema crónico\n- 38 clientes afectados, posible correlación con aumento de mora en la zona\n\n**Riesgo financiero:** ~$700/mes en MRR si estos clientes abandonan\n\n**Recomendación:** Escalar a intervención de hardware. Los reinicios no resuelven el problema raíz. Priorizar sobre Barcelona-Sur que tiene warning pero sin impacto en tickets." };
  }
  if (lower.includes("mrr") || lower.includes("ingreso") || lower.includes("churn") || lower.includes("revenue")) {
    return { engine: "claude", content: "**Análisis de MRR y Churn**\n\nMRR actual: $12,450 (+8.7% mes a mes) — crecimiento sólido.\n\n**Desglose:**\n- Nuevos clientes: +$1,261/mes\n- Churn: -$261/mes (2.1%)\n- Neto: +$1,000/mes de crecimiento\n\n**Riesgo identificado:**\n- 47 clientes morosos ($2,340 vencido)\n- Zona con mayor mora coincide con zona de fallas de red (Lechería-Norte)\n\n**Oportunidad:**\n- Campaña upselling 30→50Mbps: ~$890/mes potencial\n- Estabilizar Lechería-Norte retendría ~$700/mes en riesgo\n\nLa inversión en infraestructura se paga sola en ~2 meses." };
  }
  if (lower.includes("técnico") || lower.includes("rendimiento") || lower.includes("josé") || lower.includes("sla")) {
    return { engine: "claude", content: "**Rendimiento de Técnicos**\n\n🥇 **José Rodríguez** — 1.2h promedio, SLA 95.7%, satisfacción 4.8/5\n🥈 Carlos Pérez — 2.1h, SLA 84.2%, satisfacción 4.1/5\n🥉 Miguel Ángel — 2.8h, SLA 74.3%, satisfacción 3.9/5\n4. Luis García — 3.1h, SLA 69.7%, satisfacción 3.7/5\n\n**Insight:** José es 2.5x más eficiente. Reasignar tickets Tier 2+ a él y redistribuir Tier 1 mejoraría el SLA del 77.8% al ~90% sin contratar.\n\n**Alerta:** Luis García tiene el SLA más bajo. Revisar si necesita capacitación o si tiene tickets más complejos asignados." };
  }
  if (lower.includes("resumen") || lower.includes("ejecutivo") || lower.includes("general") || lower.includes("estado")) {
    return { engine: "claude", content: "**Resumen Ejecutivo — Wuipi Telecomunicaciones**\n\n**Estado General: 87/100** (estable con riesgo medio)\n\n**📡 Red:** 6 nodos, 94% salud. Lechería-Norte degradado (152ms latencia). Barcelona-Sur al 87% capacidad.\n\n**🎧 Soporte:** 153 tickets hoy, SLA 77.8% (meta: 90%). 34.7% clientes son reincidentes.\n\n**💰 Finanzas:** MRR $12,450 (+8.7%). Cobranza 89%. 47 morosos por $2,340.\n\n**Top 3 Acciones:**\n1. 🔴 Intervención OLT Lechería-Norte (impacto: $700/mes en riesgo)\n2. 🟡 Redistribuir técnicos para SLA +12% sin costo\n3. 🟡 Planificar expansión Barcelona-Sur antes de saturación" };
  }
  if (lower.includes("fiscal") || lower.includes("iva") || lower.includes("seniat") || lower.includes("impuesto")) {
    return { engine: "claude", content: "**Resumen Fiscal — Febrero 2026**\n\n**IVA:**\n- Débito fiscal: $1,992\n- Crédito fiscal: $580\n- **IVA a pagar: $1,412**\n- Retenciones recibidas: $423\n- **Neto a declarar: ~$989**\n\n**ISLR:** $156 en retenciones.\n**IGTF:** $89 recaudado.\n**Libros:** 996 facturas en libro de ventas.\n\n**Recordatorio:** Declaración de IVA vence los primeros 15 días de marzo. Generar TXT para portal SENIAT antes del 10." };
  }

  return { engine: "claude", content: "Analizando los datos operativos de Wuipi Telecomunicaciones...\n\nEl sistema muestra operación estable general con un punto de atención en la zona norte. ¿Sobre qué aspecto te gustaría profundizar?\n\nPuedes preguntarme sobre:\n- Estado de la red e infraestructura\n- Rendimiento de técnicos y SLA\n- MRR, churn y finanzas\n- Situación fiscal y SENIAT\n- Análisis por zonas" };
}

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Try real AI engines first
    if (isConfigured()) {
      try {
        const context = await gatherContext(request);
        const historyText = history?.length
          ? `Conversación previa:\n${history.map((m: { role: string; content: string }) => `${m.role === "user" ? "Usuario" : "Supervisor"}: ${m.content}`).join("\n")}\n\n`
          : "";

        const { content, engine } = await queryAI(
          `${historyText}Usuario pregunta: ${message}`,
          "chat",
          context
        );
        return NextResponse.json({ content, engine });
      } catch (aiError) {
        console.error("AI engines failed, falling back to mock:", aiError);
        // Fall through to mock
      }
    }

    // Mock mode — always works as fallback
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
    const mock = getMockResponse(message);
    return NextResponse.json(mock);
  } catch (error) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      { content: "Error al procesar la consulta. Intenta de nuevo.", engine: "claude" as const },
      { status: 500 }
    );
  }
}
