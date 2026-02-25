import { NextRequest, NextResponse } from "next/server";
import { queryAI, isConfigured } from "@/lib/ai/orchestrator";

// Gather context from all modules
async function gatherContext(baseUrl: string): Promise<string> {
  try {
    const [infraRes, soporteRes, finanzasRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/infraestructura`).then(r => r.json()),
      fetch(`${baseUrl}/api/soporte`).then(r => r.json()),
      fetch(`${baseUrl}/api/finanzas`).then(r => r.json()),
    ]);

    const parts: string[] = [];

    if (infraRes.status === "fulfilled") {
      const d = infraRes.value;
      parts.push(`INFRAESTRUCTURA: ${d.total_devices} dispositivos, ${d.sensors_up}/${d.total_sensors} sensores OK, health score: ${d.health_score}/100. Alertas: ${d.alerts?.length || 0}. Nodos: ${d.nodes?.map((n: any) => `${n.name}(${n.status}, latencia:${n.metrics?.latency || '?'}ms)`).join(', ')}`);
    }

    if (soporteRes.status === "fulfilled") {
      const d = soporteRes.value;
      parts.push(`SOPORTE: ${d.tickets_today} tickets hoy, ${d.tickets_open} abiertos, ${d.tickets_unassigned} sin asignar. SLA: ${d.sla?.compliance_rate}%. Clientes únicos: ${d.unique_clients_today}, reincidentes: ${d.repeat_clients} (${d.repeat_client_pct}%). Top zona: ${d.by_zone?.[0]?.zone} con ${d.by_zone?.[0]?.tickets_open} abiertos. Técnicos: ${d.by_technician?.map((t: any) => `${t.name}(${t.avg_resolution_hours}h, SLA:${t.sla_compliance}%)`).join(', ')}`);
    }

    if (finanzasRes.status === "fulfilled") {
      const d = finanzasRes.value;
      parts.push(`FINANZAS: MRR $${d.revenue?.mrr} (+${d.revenue?.mrr_growth}%), cobranza ${d.collections?.collection_rate}%, morosos: ${d.total_debtors} ($${d.collections?.total_overdue_usd} vencido), ARPU $${d.revenue?.arpu}, churn ${d.revenue?.churn_rate}%. Tasa BCV: Bs ${d.bcv_rate?.usd_to_bs}. IVA a pagar: $${d.tax_summary?.iva_to_pay}`);
    }

    return `DATOS ACTUALES DE WUIPI TELECOMUNICACIONES (${new Date().toLocaleString("es-VE")}):\n${parts.join('\n')}`;
  } catch (error) {
    return "No se pudieron obtener datos actuales de los módulos.";
  }
}

// Mock responses when no AI is configured
const MOCK_RESPONSES: Record<string, { content: string; engine: "claude" | "gemini" }> = {
  default: {
    content: "Analizando los datos de todos los módulos... El sistema está operando con normalidad general. ¿Sobre qué aspecto específico de la operación te gustaría profundizar?",
    engine: "claude",
  },
  norte: {
    content: "**Estado Zona Norte — Análisis en Tiempo Real**\n\nEl OLT Lechería-Norte opera en estado degradado con latencia de 152ms (umbral: 100ms) y packet loss de 8.2%.\n\n**Impacto cruzado:**\n- 42 tickets esta semana desde esta zona (vs promedio 18)\n- 14 clientes reincidentes — señal de problema crónico\n- 38 clientes afectados, posible correlación con aumento de mora en la zona\n\n**Riesgo financiero:** ~$700/mes en MRR si estos clientes abandonan\n\n**Recomendación:** Escalar a intervención de hardware. Los reinicios no resuelven el problema raíz. Priorizar sobre Barcelona-Sur que tiene warning pero sin impacto en tickets.",
    engine: "claude",
  },
  mrr: {
    content: "**Análisis de MRR y Churn**\n\nMRR actual: $12,450 (+8.7% mes a mes) — crecimiento sólido.\n\n**Desglose:**\n- Nuevos clientes: +$1,261/mes\n- Churn: -$261/mes (2.1%)\n- Neto: +$1,000/mes de crecimiento\n\n**Riesgo identificado:**\n- 47 clientes morosos ($2,340 vencido)\n- Zona con mayor mora coincide con zona de fallas de red (Lechería-Norte)\n- El churn se concentra donde hay problemas de infraestructura\n\n**Oportunidad:**\n- Campaña upselling 30→50Mbps: ~$890/mes potencial\n- Estabilizar Lechería-Norte retendría ~$700/mes en riesgo\n\nLa inversión en infraestructura se paga sola en ~2 meses.",
    engine: "claude",
  },
  tecnico: {
    content: "**Rendimiento de Técnicos**\n\n🥇 **José Rodríguez** — 1.2h promedio, SLA 95.7%, satisfacción 4.8/5\n🥈 Carlos Pérez — 2.1h, SLA 84.2%, satisfacción 4.1/5\n🥉 Miguel Ángel — 2.8h, SLA 74.3%, satisfacción 3.9/5\n4. Luis García — 3.1h, SLA 69.7%, satisfacción 3.7/5\n\n**Insight:** José es 2.5x más eficiente. Reasignar tickets Tier 2+ a él y redistribuir Tier 1 mejoraría el SLA del 77.8% al ~90% sin contratar.\n\n**Alerta:** Luis García tiene el SLA más bajo. Revisar si necesita capacitación o si tiene tickets más complejos asignados desproporcionadamente.",
    engine: "claude",
  },
  resumen: {
    content: "**Resumen Ejecutivo — Wuipi Telecomunicaciones**\n\n**Estado General: 87/100** (estable con riesgo medio)\n\n**📡 Red:** 6 nodos, 94% salud. Lechería-Norte degradado (152ms latencia, 8.2% packet loss). Barcelona-Sur al 87% capacidad — saturación en ~18 días.\n\n**🎧 Soporte:** 153 tickets hoy, SLA 77.8% (meta: 90%). 5 sin asignar. 34.7% clientes son reincidentes — problema sistémico.\n\n**💰 Finanzas:** MRR $12,450 (+8.7%). Cobranza 89%. 47 morosos por $2,340. IVA a pagar: $1,412.\n\n**Top 3 Acciones:**\n1. 🔴 Intervención OLT Lechería-Norte (impacto: $700/mes en riesgo)\n2. 🟡 Redistribuir técnicos para SLA +12% sin costo\n3. 🟡 Planificar expansión Barcelona-Sur antes de saturación",
    engine: "claude",
  },
  fiscal: {
    content: "**Resumen Fiscal — Febrero 2026**\n\n**IVA:**\n- Débito fiscal: $1,992 (IVA cobrado a clientes)\n- Crédito fiscal: $580 (IVA pagado a proveedores)\n- **IVA a pagar: $1,412**\n- Retenciones recibidas: $423 (a descontar)\n- **Neto a declarar: ~$989**\n\n**ISLR:** $156 en retenciones realizadas a proveedores.\n\n**IGTF:** $89 recaudado por pagos en divisas.\n\n**Libros:** 996 facturas en libro de ventas, 34 en libro de compras.\n\n**Recordatorio:** Declaración de IVA vence los primeros 15 días del mes siguiente. Asegurar que los TXT para el portal SENIAT estén generados antes del 10 de marzo.",
    engine: "claude",
  },
};

function getMockResponse(query: string): { content: string; engine: "claude" | "gemini" } {
  const lower = query.toLowerCase();
  if (lower.includes("norte") || lower.includes("lechería") || lower.includes("zona")) return MOCK_RESPONSES.norte;
  if (lower.includes("mrr") || lower.includes("ingreso") || lower.includes("churn") || lower.includes("revenue")) return MOCK_RESPONSES.mrr;
  if (lower.includes("técnico") || lower.includes("rendimiento") || lower.includes("josé") || lower.includes("sla")) return MOCK_RESPONSES.tecnico;
  if (lower.includes("resumen") || lower.includes("ejecutivo") || lower.includes("general") || lower.includes("estado")) return MOCK_RESPONSES.resumen;
  if (lower.includes("fiscal") || lower.includes("iva") || lower.includes("seniat") || lower.includes("impuesto") || lower.includes("tax")) return MOCK_RESPONSES.fiscal;
  return MOCK_RESPONSES.default;
}

export async function POST(request: NextRequest) {
  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // If AI is configured, use real engines
    if (isConfigured()) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const context = await gatherContext(baseUrl);

      const historyText = history?.length
        ? `Conversación previa:\n${history.map((m: any) => `${m.role === "user" ? "Usuario" : "Supervisor"}: ${m.content}`).join("\n")}\n\n`
        : "";

      const { content, engine } = await queryAI(
        `${historyText}Usuario pregunta: ${message}`,
        "chat",
        context
      );

      return NextResponse.json({ content, engine });
    }

    // Mock mode
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));
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
