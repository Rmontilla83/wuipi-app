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
// Gemini Flash — REST API (no SDK needed)
// ============================================

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];

async function geminiRequest(body: object): Promise<any> {
  let lastError = "";
  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 404) {
      lastError = `${model}: 404 not found`;
      console.warn(`[AI Router] Model ${model} not available, trying next...`);
      continue;
    }
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API ${res.status} (${model}): ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    // Gemini 2.5 returns thinking + response parts; take last non-thought text
    const text = parts
      .filter((p: any) => p.text && !p.thought)
      .map((p: any) => p.text)
      .join("") || parts.map((p: any) => p.text || "").join("");
    if (!text) {
      const reason = data.candidates?.[0]?.finishReason || "unknown";
      throw new Error(`Gemini (${model}) returned empty (finishReason: ${reason})`);
    }
    console.log(`[AI Router] Gemini ${model} — ${text.length} chars`);
    return text;
  }
  throw new Error(`No Gemini model available: ${lastError}`);
}

async function callGeminiFlash(
  systemPrompt: string,
  userContent: string,
  maxTokens: number = 1000,
  jsonMode: boolean = false,
): Promise<string> {
  const generationConfig: Record<string, any> = { maxOutputTokens: maxTokens };
  if (jsonMode) {
    generationConfig.responseMimeType = "application/json";
  }
  return geminiRequest({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig,
  });
}

async function callGeminiFlashChat(
  systemPrompt: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number = 1000,
): Promise<string> {
  const contents = history.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  return geminiRequest({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  });
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

  const errors: string[] = [];

  // Prefer Gemini Flash (cheap), fallback to Claude
  if (engines.gemini) {
    try {
      const content = await callGeminiFlash(systemPrompt, userContent, 2000, true);
      return { content, engine: "gemini" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AI Router] Gemini Flash failed for briefing:", msg);
      errors.push(`Gemini: ${msg}`);
    }
  }

  if (engines.claude) {
    try {
      const content = await callClaudeSonnet(
        systemPrompt,
        [{ role: "user", content: userContent }],
        1500,
      );
      return { content, engine: "claude" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AI Router] Claude failed for briefing:", msg);
      errors.push(`Claude: ${msg}`);
    }
  }

  if (!engines.gemini && !engines.claude) {
    throw new Error("No AI engine configured. Add GEMINI_API_KEY or ANTHROPIC_API_KEY.");
  }
  throw new Error(`All AI engines failed: ${errors.join(" | ")}`);
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

  const errors: string[] = [];

  // Complex question + Claude available → use Claude
  if (isComplex && engines.claude) {
    try {
      const content = await callClaudeSonnet(systemPrompt, messages, 1500);
      return { content, engine: "claude" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AI Router] Claude failed, falling back to Gemini:", msg);
      errors.push(`Claude: ${msg}`);
    }
  }

  // Default path: Gemini Flash handles everything (simple + complex fallback)
  if (engines.gemini) {
    try {
      const content = await callGeminiFlashChat(systemPrompt, messages, 1000);
      return { content, engine: "gemini" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AI Router] Gemini Flash failed for chat:", msg);
      errors.push(`Gemini: ${msg}`);
    }
  }

  // Last resort: Claude for anything if Gemini is down
  if (engines.claude && !errors.some(e => e.startsWith("Claude:"))) {
    try {
      const content = await callClaudeSonnet(systemPrompt, messages, 1500);
      return { content, engine: "claude" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Claude: ${msg}`);
    }
  }

  if (!engines.gemini && !engines.claude) {
    throw new Error("No AI engine configured. Add GEMINI_API_KEY or ANTHROPIC_API_KEY.");
  }
  throw new Error(`All AI engines failed: ${errors.join(" | ")}`);
}
