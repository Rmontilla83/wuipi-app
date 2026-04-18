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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  for (const model of GEMINI_MODELS) {
    // API key sent as header, NOT query string — query strings leak through
    // Vercel logs, CDN access logs, and Referer headers.
    const url = `${GEMINI_API_BASE}/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
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
  console.log(`[AI Router] Calling Claude Sonnet (system: ${systemPrompt.length} chars, msgs: ${messages.length}, maxTokens: ${maxTokens})`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Use REST API directly (avoids dynamic import issues in Vercel serverless)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[AI Router] Claude API ${res.status}: ${errBody.slice(0, 300)}`);
    throw new Error(`Claude API ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  const inputTokens = data.usage?.input_tokens || "?";
  const outputTokens = data.usage?.output_tokens || "?";
  console.log(`[AI Router] Claude Sonnet — ${inputTokens} input, ${outputTokens} output tokens`);
  return text;
}

// ============================================
// Public API: Generate Briefing (Dual Engine)
// ============================================
// Step 1: Gemini Flash analyzes raw data → structured summary + anomalies
// Step 2: Claude correlates across areas → insights + recommendations
// If only one engine available, it does both steps.

export interface DualBriefingResponse {
  content: string;
  engine: "dual" | "gemini" | "claude";
  engines_used: { analysis: AIEngine | null; strategy: AIEngine | null };
}

export async function generateDualBriefing(
  geminiPrompt: string,
  claudePrompt: string,
  singleFallbackPrompt: string,
  context: string,
): Promise<DualBriefingResponse> {
  const engines = getAvailableEngines();
  const timestamp = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
  const userContent = `Fecha y hora actual: ${timestamp}\n\nDatos del negocio:\n${context}`;

  const errors: string[] = [];

  // DUAL MODE: Gemini analyzes → Claude correlates
  if (engines.gemini && engines.claude) {
    try {
      // Step 1: Gemini Flash — data summary + anomaly detection
      console.log("[AI Router] Step 1: Gemini Flash analyzing data...");
      const geminiAnalysis = await callGeminiFlash(geminiPrompt, userContent, 4096, true);
      console.log(`[AI Router] Gemini analysis complete — ${geminiAnalysis.length} chars`);

      // Step 2: Claude — correlations + strategic recommendations
      // Only pass Gemini's analysis (not raw data again — it's already summarized)
      const claudeInput = `Fecha y hora actual: ${timestamp}\n\nANALISIS DE DATOS (generado por Gemini Flash a partir de datos en tiempo real):\n${geminiAnalysis}`;
      console.log(`[AI Router] Step 2: Claude correlating (${claudeInput.length} chars)...`);
      const claudeResult = await callClaudeSonnet(
        claudePrompt,
        [{ role: "user", content: claudeInput }],
        4096,
      );
      console.log(`[AI Router] Claude analysis complete — ${claudeResult.length} chars`);

      return { content: claudeResult, engine: "dual", engines_used: { analysis: "gemini", strategy: "claude" } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3).join(" ") : "";
      console.error(`[AI Router] Dual briefing failed: ${msg} | ${stack}`);
      errors.push(`Dual: ${msg}`);
      // Fall through to single mode
    }
  }

  // SINGLE MODE: Use the FINAL format prompt (not the step-1 analysis prompt)
  if (engines.gemini) {
    try {
      console.log("[AI Router] Single mode: Gemini with full prompt...");
      const content = await callGeminiFlash(singleFallbackPrompt, userContent, 4096, true);
      return { content, engine: "gemini", engines_used: { analysis: "gemini", strategy: null } };
    } catch (err) {
      errors.push(`Gemini: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (engines.claude) {
    try {
      console.log("[AI Router] Single mode: Claude with full prompt...");
      const content = await callClaudeSonnet(singleFallbackPrompt, [{ role: "user", content: userContent }], 4096);
      return { content, engine: "claude", engines_used: { analysis: null, strategy: "claude" } };
    } catch (err) {
      errors.push(`Claude: ${err instanceof Error ? err.message : String(err)}`);
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
