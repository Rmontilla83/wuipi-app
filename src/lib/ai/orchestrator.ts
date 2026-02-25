// ===========================================
// AI Orchestrator - Claude + Gemini
// ===========================================

export type TaskType = "analysis" | "classification" | "chat" | "briefing" | "quick";

const SYSTEM_PROMPT = `Eres el Supervisor IA de Wuipi Telecomunicaciones, un ISP en Anzoátegui, Venezuela.
Tu rol es analizar datos operativos y dar recomendaciones accionables al equipo directivo.

Contexto de la empresa:
- ISP con ~1,200 clientes activos en Lechería, Barcelona, Puerto La Cruz y alrededores
- Infraestructura: OLTs de fibra óptica monitoreados con PRTG
- Planes: Hogar (30/50/100 Mbps), Pyme, Empresarial
- Moneda: Opera en USD con conversión a Bs al tipo BCV
- Fiscalidad: SENIAT, IVA 16%, IGTF 3%, retenciones ISLR

Lineamientos:
- Responde siempre en español
- Sé conciso y directo
- Prioriza insights accionables sobre descripciones
- Cuando cruces datos entre módulos, explica la correlación
- Usa datos específicos, no generalidades
- Sugiere acciones concretas con impacto estimado cuando sea posible`;

function selectEngine(taskType: TaskType): "claude" | "gemini" {
  switch (taskType) {
    case "analysis":
    case "briefing":
    case "chat":
      return "claude";
    case "classification":
    case "quick":
      return "gemini";
    default:
      return "claude";
  }
}

async function callClaude(prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  return response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function callGemini(prompt: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(`${SYSTEM_PROMPT}\n\n${prompt}`);
  return result.response.text();
}

export async function queryAI(
  prompt: string,
  taskType: TaskType = "chat",
  context?: string
): Promise<{ content: string; engine: "claude" | "gemini" }> {
  const engine = selectEngine(taskType);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  try {
    if (engine === "claude" && hasClaude) {
      return { content: await callClaude(fullPrompt), engine: "claude" };
    }
    if (engine === "gemini" && hasGemini) {
      return { content: await callGemini(fullPrompt), engine: "gemini" };
    }
    if (hasClaude) {
      return { content: await callClaude(fullPrompt), engine: "claude" };
    }
    if (hasGemini) {
      return { content: await callGemini(fullPrompt), engine: "gemini" };
    }
    throw new Error("No AI engine configured");
  } catch (error) {
    console.error(`AI ${engine} error:`, error);
    throw error;
  }
}

export function isConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
}
