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

async function callClaude(prompt: string): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response.content as any[])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function callGemini(prompt: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(`${SYSTEM_PROMPT}\n\n${prompt}`);
  return result.response.text();
}

export async function queryAI(
  prompt: string,
  taskType: TaskType = "chat",
  context?: string
): Promise<{ content: string; engine: "claude" | "gemini" }> {
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  // Try available engines - prefer based on task, fallback to whatever is available
  const engines: Array<{ name: "claude" | "gemini"; available: boolean; call: () => Promise<string> }> = [];

  // For analysis/briefing/chat prefer Claude, for quick/classification prefer Gemini
  if (taskType === "classification" || taskType === "quick") {
    engines.push({ name: "gemini", available: hasGemini, call: () => callGemini(fullPrompt) });
    engines.push({ name: "claude", available: hasClaude, call: () => callClaude(fullPrompt) });
  } else {
    engines.push({ name: "claude", available: hasClaude, call: () => callClaude(fullPrompt) });
    engines.push({ name: "gemini", available: hasGemini, call: () => callGemini(fullPrompt) });
  }

  for (const engine of engines) {
    if (!engine.available) continue;
    try {
      const content = await engine.call();
      return { content, engine: engine.name };
    } catch (error) {
      console.error(`AI ${engine.name} failed:`, error);
      continue; // Try next engine
    }
  }

  throw new Error("No AI engine available or all engines failed");
}

export function isConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
}
