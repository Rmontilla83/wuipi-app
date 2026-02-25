import { NextResponse } from "next/server";
import { queryAI, isConfigured } from "@/lib/ai/orchestrator";
import type { AISupervisorData } from "@/types/ai";

const MOCK_DATA: AISupervisorData = {
  briefing: {
    date: new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    overall_score: 87,
    summary: "La operación está estable con un punto de atención crítico en la zona norte. La red opera al 94% de salud, pero el OLT Lechería-Norte muestra degradación progresiva con 152ms de latencia y 8.2% de packet loss. Financieramente, el MRR creció 8.7% mes a mes superando la meta. El backlog de soporte necesita atención: 5 tickets sin asignar y SLA en 77.8% (meta: 90%). La tasa de reincidencia del 34.7% indica problemas sistémicos que requieren intervención de infraestructura, no solo soporte reactivo.",
    key_metrics: [
      { label: "Salud General", value: "87/100", trend: "stable", icon: "🏢" },
      { label: "Riesgo Operativo", value: "Medio", trend: "up", icon: "⚠️" },
      { label: "Eficiencia Financiera", value: "89%", trend: "up", icon: "📈" },
      { label: "Satisfacción Cliente", value: "4.2/5", trend: "down", icon: "⭐" },
    ],
    generated_at: new Date().toISOString(),
    engine: "claude",
  },
  insights: [
    {
      id: "ins-1", priority: "critical", engine: "claude",
      title: "Correlación: Falla Lechería-Norte ↔ Tickets ↔ Mora",
      body: "El OLT Lechería-Norte ha tenido degradación sostenida. Los 38 clientes afectados generaron 42 tickets esta semana (vs promedio 18). De estos, 14 son reincidentes y la mora en la zona aumentó. Costo de no actuar: ~$700/mes en MRR en riesgo. Recomendación: Intervención de hardware urgente.",
      modules: ["infraestructura", "soporte", "finanzas"],
      confidence: 94, actions: ["Ver clientes afectados", "Crear orden de trabajo", "Pausar cobranza zona"],
      timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
    },
    {
      id: "ins-2", priority: "high", engine: "gemini",
      title: "Barcelona-Sur: saturación en ~18 días",
      body: "El nodo Barcelona-Sur creció del 62% al 87% de capacidad en 30 días. Al ritmo actual de altas, alcanzará 100% en 18 días. Coordinar con ventas para redirigir nuevas altas a Barcelona-Centro (61%) o planificar expansión.",
      modules: ["infraestructura", "ventas"],
      confidence: 89, actions: ["Proyección de capacidad", "Alertar a ventas"],
      timestamp: new Date(Date.now() - 22 * 60000).toISOString(),
    },
    {
      id: "ins-3", priority: "medium", engine: "claude",
      title: "Oportunidad: Upselling plan 30→50Mbps",
      body: "Clientes del plan 30Mbps generan 3x más tickets por \"lentitud\". Migrar el 30% al plan 50Mbps generaría ~$890/mes adicionales y reduciría tickets ~45%. Win-win: más ingreso + menos carga operativa.",
      modules: ["soporte", "finanzas"],
      confidence: 82, actions: ["Ver segmento", "Crear campaña", "Simular impacto"],
      timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    },
    {
      id: "ins-4", priority: "medium", engine: "gemini",
      title: "Redistribuir técnicos mejoraría SLA 12%",
      body: "José Rodríguez resuelve en 1.2h vs promedio 2.4h. Asignarle tickets complejos y redistribuir simples llevaría el SLA del 77.8% al ~90% sin costo adicional.",
      modules: ["soporte"],
      confidence: 76, actions: ["Ver métricas", "Proponer redistribución"],
      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "ins-5", priority: "low", engine: "claude",
      title: "Mora se normalizará en ~5 días",
      body: "El incremento de mora del 15% coincide con feriado bancario y retraso de Banco de Venezuela. Históricamente se corrige en 4-6 días hábiles. No se recomienda cobranza agresiva en este período.",
      modules: ["finanzas"],
      confidence: 91, actions: ["Ver historial de patrones"],
      timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
  ],
  suggested_questions: [
    "¿Cuál es el estado actual de la zona norte?",
    "¿Cuánto MRR estamos perdiendo por churn?",
    "¿Qué técnico tiene mejor rendimiento?",
    "Dame un resumen ejecutivo",
    "¿Cómo va el tema fiscal este mes?",
    "¿Qué zonas necesitan expansión?",
  ],
};

export async function GET() {
  try {
    // TODO: When AI is configured, generate real briefing
    return NextResponse.json(MOCK_DATA);
  } catch (error) {
    console.error("Briefing error:", error);
    return NextResponse.json(MOCK_DATA);
  }
}
