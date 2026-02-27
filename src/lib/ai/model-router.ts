// ============================================
// AI Model Router — Cost-Optimized
// ============================================
// Gemini Flash: briefing, insights, simple data questions (~$0.075/1M in)
// Claude Sonnet: complex reasoning, strategy, correlations (~$3/1M in)
// ============================================

export type AIEngine = "gemini" | "claude";

export interface AIResponse {
  content: string;
  engine: AIEngine;
}

// ============================================
// Configuration check
// ============================================

export function getAvailableEngines(): { gemini: boolean; claude: boolean } {
  return {
    gemini: !!process.env.GEMINI_API_KEY,
    claude: !!process.env.ANTHROPIC_API_KEY,
  };
}

export function isAnyEngineConfigured(): boolean {
  const engines = getAvailableEngines();
  return engines.gemini || engines.claude;
}

// ============================================
// Chat question classifier
// ============================================

const COMPLEX_PATTERNS = [
  /recomien/i, /estrategia/i, /analiz/i, /por qu[eé]/i,
  /correlaci[oó]n/i, /qu[eé] har[ií]/i, /c[oó]mo mejorar/i,
  /qu[eé] opinas/i, /evalua/i, /evalúa/i, /compara/i,
  /prioriz/i, /impacto/i, /proyecci[oó]n/i, /tendencia/i,
  /plan de acci[oó]n/i, /riesgo/i, /oportunidad/i,
  /qu[eé] deber[ií]/i, /sugi[eé]r/i, /propón/i, /propon/i,
];

export function classifyQuestion(message: string): AIEngine {
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(message)) return "claude";
  }
  return "gemini";
}

// ============================================
// Gemini Flash call
// ============================================

async function callGeminiFlash(
  systemPrompt: string,
  userContent: string,
  maxTokens: number = 1000,
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: maxTokens },
  });

  const result = await model.generateContent(`${systemPrompt}\n\n${userContent}`);
  const text = result.response.text();
  console.log(`[AI Router] Gemini Flash — ~${Math.round(userContent.length / 4)} input tokens, ~${Math.round(text.length / 4)} output tokens`);
  return text;
}

// ============================================
// Gemini Flash call with history (chat)
// ============================================

async function callGeminiFlashChat(
  systemPrompt: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number = 1000,
): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { maxOutputTokens: maxTokens },
    systemInstruction: systemPrompt,
  });

  const geminiHistory = history.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });
  const lastMessage = history[history.length - 1]?.content || "";
  const result = await chat.sendMessage(lastMessage);
  const text = result.response.text();
  console.log(`[AI Router] Gemini Flash Chat — ~${Math.round(lastMessage.length / 4)} input tokens, ~${Math.round(text.length / 4)} output tokens`);
  return text;
}

// ============================================
// Claude Sonnet call
// ============================================

async function callClaudeSonnet(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number = 1500,
): Promise<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });

  const text = (response.content as any[])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const inputTokens = (response as any).usage?.input_tokens || "?";
  const outputTokens = (response as any).usage?.output_tokens || "?";
  console.log(`[AI Router] Claude Sonnet — ${inputTokens} input tokens, ${outputTokens} output tokens`);
  return text;
}

// ============================================
// Public API: Generate Briefing (Gemini Flash)
// ============================================

export async function generateBriefing(
  systemPrompt: string,
  context: string,
): Promise<AIResponse> {
  const engines = getAvailableEngines();
  const userContent = `Fecha y hora actual: ${new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" })}\n\nDatos del negocio:\n${context}`;

  // Prefer Gemini Flash (cheap), fallback to Claude
  if (engines.gemini) {
    try {
      const content = await callGeminiFlash(systemPrompt, userContent, 1000);
      return { content, engine: "gemini" };
    } catch (err) {
      console.error("[AI Router] Gemini Flash failed for briefing, trying Claude:", err);
    }
  }

  if (engines.claude) {
    const content = await callClaudeSonnet(
      systemPrompt,
      [{ role: "user", content: userContent }],
      1500,
    );
    return { content, engine: "claude" };
  }

  throw new Error("No AI engine configured");
}

// ============================================
// Public API: Chat (routed by complexity)
// ============================================

export async function chatWithSupervisor(
  systemPrompt: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AIResponse> {
  const engines = getAvailableEngines();
  const isComplex = classifyQuestion(message) === "claude";

  // Build full messages array
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

  // Complex question + Claude available → use Claude
  if (isComplex && engines.claude) {
    try {
      console.log(`[AI Router] Complex question detected → Claude Sonnet`);
      const content = await callClaudeSonnet(systemPrompt, messages, 1500);
      return { content, engine: "claude" };
    } catch (err) {
      console.error("[AI Router] Claude failed, falling back to Gemini:", err);
    }
  }

  // Default path: Gemini Flash handles everything (simple + complex fallback)
  if (engines.gemini) {
    try {
      console.log(`[AI Router] ${isComplex ? "Complex (no Claude)" : "Simple"} → Gemini Flash`);
      const content = await callGeminiFlashChat(systemPrompt, messages, 1000);
      return { content, engine: "gemini" };
    } catch (err) {
      console.error("[AI Router] Gemini Flash failed for chat:", err);
    }
  }

  // Last resort: Claude for anything if Gemini is down
  if (engines.claude) {
    const content = await callClaudeSonnet(systemPrompt, messages, 1500);
    return { content, engine: "claude" };
  }

  throw new Error("No AI engine configured or all engines failed");
}
