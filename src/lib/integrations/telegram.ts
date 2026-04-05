// ============================================
// Telegram Bot Integration
// ============================================
// Uses Telegram Bot API directly (no SDK needed).
// Sends formatted briefings to channels per area.
// ============================================

const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  return token;
}

export function isConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

// Channel IDs from env vars
export function getChannels(): {
  socios: string | null;
  operaciones: string | null;
  finanzas: string | null;
  comercial: string | null;
} {
  return {
    socios: process.env.TELEGRAM_CHANNEL_SOCIOS || null,
    operaciones: process.env.TELEGRAM_CHANNEL_OPERACIONES || null,
    finanzas: process.env.TELEGRAM_CHANNEL_FINANZAS || null,
    comercial: process.env.TELEGRAM_CHANNEL_COMERCIAL || null,
  };
}

// ============================================
// Send message to a chat/channel
// ============================================
export async function sendMessage(
  chatId: string,
  text: string,
  parseMode: "HTML" | "MarkdownV2" = "HTML",
): Promise<boolean> {
  const token = getToken();
  const url = `${TELEGRAM_API}${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Telegram] Failed to send to ${chatId}:`, err);
    return false;
  }

  console.log(`[Telegram] Message sent to ${chatId} (${text.length} chars)`);
  return true;
}

// ============================================
// Format briefing for #socios-360 (all areas)
// ============================================
export function formatSociosBriefing(briefing: any): string {
  const date = new Date().toLocaleDateString("es-VE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Caracas",
  });

  const scoreEmoji = briefing.score >= 80 ? "🟢" : briefing.score >= 50 ? "🟡" : "🔴";
  const trendEmoji = briefing.score_trend === "improving" ? "↗️" : briefing.score_trend === "declining" ? "↘️" : "→";

  // Extract key metrics from KPIs
  const kpis = briefing.kpis || {};
  const kpiLines: string[] = [];
  if (kpis.salud_general) kpiLines.push(`🏢 Salud: <b>${kpis.salud_general.value}</b>`);
  if (kpis.salud_financiera) kpiLines.push(`💰 Finanzas: <b>${kpis.salud_financiera.value}</b>`);
  if (kpis.eficiencia_soporte) kpiLines.push(`🎧 Soporte: <b>${kpis.eficiencia_soporte.value}</b>`);
  if (kpis.crecimiento) kpiLines.push(`📈 Crecimiento: <b>${kpis.crecimiento.value}</b>`);
  if (kpis.riesgo_operativo) kpiLines.push(`⚠️ Riesgo: <b>${kpis.riesgo_operativo.value}</b>`);

  // Insights
  const insightLines = (briefing.insights || []).slice(0, 5).map((ins: any) => {
    const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : ins.severity === "medium" ? "🟡" : "🔵";
    return `${icon} ${escHtml(ins.title)}`;
  });

  // Recommendations
  const recs = briefing.recomendaciones_por_area || {};
  const recLines: string[] = [];
  if (recs.operaciones) recLines.push(`⚙️ <b>Ops:</b> ${escHtml(recs.operaciones)}`);
  if (recs.finanzas) recLines.push(`💰 <b>Fin:</b> ${escHtml(recs.finanzas)}`);
  if (recs.comercial) recLines.push(`📈 <b>Com:</b> ${escHtml(recs.comercial)}`);

  const engine = briefing.engine === "dual" ? "Gemini + Claude" : briefing.engine || "IA";

  const parts = [
    `🏢 <b>WUIPI — Briefing Diario</b>`,
    `📅 ${escHtml(date)} | Score: <b>${briefing.score}/100</b> ${scoreEmoji} ${trendEmoji}`,
    ``,
    kpiLines.join("\n"),
    ``,
    `📋 <b>ALERTAS:</b>`,
    insightLines.length > 0 ? insightLines.join("\n") : "Sin alertas",
  ];

  if (briefing.summary) {
    parts.push(``, `💡 <b>RESUMEN:</b>`, escHtml(briefing.summary));
  }

  if (recLines.length > 0) {
    parts.push(``, `🎯 <b>RECOMENDACIONES:</b>`, recLines.join("\n"));
  }

  parts.push(``, `🤖 ${engine} | ${new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" })}`);

  return parts.join("\n");
}

// ============================================
// Format for #operaciones (infra + soporte)
// ============================================
export function formatOperacionesBriefing(briefing: any): string {
  const insights = (briefing.insights || [])
    .filter((ins: any) => ins.para === "operaciones" || ins.para === "todos" || ins.category === "infraestructura" || ins.category === "soporte")
    .slice(0, 5);

  // Sanitize insights for ops: remove dollar amounts, replace with % MRR
  const sanitizedInsights = insights.map((ins: any) => ({
    ...ins,
    title: removeDollarAmounts(ins.title),
    description: removeDollarAmounts(ins.description),
  }));

  const kpis = briefing.kpis || {};
  const parts = [
    `⚙️ <b>OPERACIONES — Briefing Diario</b>`,
    ``,
  ];

  if (kpis.eficiencia_soporte) parts.push(`🎧 Soporte: <b>${kpis.eficiencia_soporte.value}</b> (${trendLabel(kpis.eficiencia_soporte.trend)})`);
  if (kpis.riesgo_operativo) parts.push(`⚠️ Riesgo: <b>${kpis.riesgo_operativo.value}</b> (${trendLabel(kpis.riesgo_operativo.trend)})`);

  if (sanitizedInsights.length > 0) {
    parts.push(``, `📋 <b>ALERTAS:</b>`);
    for (const ins of sanitizedInsights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} <b>${escHtml(ins.title)}</b>`);
      parts.push(`   ${escHtml(ins.description)}`);
    }
  } else {
    parts.push(``, `✅ Sin alertas operativas`);
  }

  const rec = briefing.recomendaciones_por_area?.operaciones;
  if (rec) parts.push(``, `🎯 <b>Recomendacion:</b> ${escHtml(removeDollarAmounts(rec))}`);

  parts.push(``, `🤖 Supervisor IA | ${timeNow()}`);
  return parts.join("\n");
}

// ============================================
// Format for #finanzas (cobranza + MRR + CxC)
// ============================================
export function formatFinanzasBriefing(briefing: any): string {
  const insights = (briefing.insights || [])
    .filter((ins: any) => ins.para === "finanzas" || ins.para === "todos" || ins.category === "finanzas")
    .slice(0, 5);

  const kpis = briefing.kpis || {};
  const parts = [
    `💰 <b>FINANZAS — Briefing Diario</b>`,
    ``,
  ];

  if (kpis.salud_financiera) parts.push(`💰 Salud: <b>${kpis.salud_financiera.value}</b> (${trendLabel(kpis.salud_financiera.trend)})`);

  if (insights.length > 0) {
    parts.push(``, `📋 <b>ALERTAS:</b>`);
    for (const ins of insights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} <b>${escHtml(ins.title)}</b>`);
      parts.push(`   ${escHtml(ins.description)}`);
    }
  } else {
    parts.push(``, `✅ Sin alertas financieras`);
  }

  const rec = briefing.recomendaciones_por_area?.finanzas;
  if (rec) parts.push(``, `🎯 <b>Recomendacion:</b> ${escHtml(rec)}`);

  parts.push(``, `🤖 Supervisor IA | ${timeNow()}`);
  return parts.join("\n");
}

// ============================================
// Format for #comercial (ventas + CxC + churn)
// ============================================
export function formatComercialBriefing(briefing: any): string {
  const insights = (briefing.insights || [])
    .filter((ins: any) => ins.para === "comercial" || ins.para === "todos" || ins.category === "ventas" || ins.category === "clientes")
    .slice(0, 5);

  const kpis = briefing.kpis || {};
  const parts = [
    `📈 <b>COMERCIAL — Briefing Diario</b>`,
    ``,
  ];

  if (kpis.crecimiento) parts.push(`📈 Crecimiento: <b>${kpis.crecimiento.value}</b> (${trendLabel(kpis.crecimiento.trend)})`);

  if (insights.length > 0) {
    parts.push(``, `📋 <b>ALERTAS:</b>`);
    for (const ins of insights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} <b>${escHtml(ins.title)}</b>`);
      parts.push(`   ${escHtml(ins.description)}`);
    }
  } else {
    parts.push(``, `✅ Sin alertas comerciales`);
  }

  const rec = briefing.recomendaciones_por_area?.comercial;
  if (rec) parts.push(``, `🎯 <b>Recomendacion:</b> ${escHtml(rec)}`);

  parts.push(``, `🤖 Supervisor IA | ${timeNow()}`);
  return parts.join("\n");
}

// ============================================
// Send briefing to all configured channels
// ============================================
export async function sendBriefingToAllChannels(briefing: any): Promise<{
  sent: string[];
  failed: string[];
}> {
  const channels = getChannels();
  const sent: string[] = [];
  const failed: string[] = [];

  const sends: Array<{ name: string; chatId: string | null; format: (b: any) => string }> = [
    { name: "socios", chatId: channels.socios, format: formatSociosBriefing },
    { name: "operaciones", chatId: channels.operaciones, format: formatOperacionesBriefing },
    { name: "finanzas", chatId: channels.finanzas, format: formatFinanzasBriefing },
    { name: "comercial", chatId: channels.comercial, format: formatComercialBriefing },
  ];

  for (const { name, chatId, format } of sends) {
    if (!chatId) {
      console.log(`[Telegram] Skipping #${name} — no channel ID configured`);
      continue;
    }
    try {
      const text = format(briefing);
      const ok = await sendMessage(chatId, text);
      if (ok) sent.push(name);
      else failed.push(name);
    } catch (err) {
      console.error(`[Telegram] Error sending to #${name}:`, err);
      failed.push(name);
    }
  }

  return { sent, failed };
}

// ============================================
// Helpers
// ============================================
function removeDollarAmounts(text: string): string {
  // Remove dollar amounts like $79,764 or $1,234.56 — ops shouldn't see financial figures
  return text.replace(/\$[\d,]+(?:\.\d+)?/g, "[monto]");
}

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function trendLabel(trend: string): string {
  return trend === "up" ? "↗️ mejorando" : trend === "down" ? "↘️ bajando" : "→ estable";
}

function timeNow(): string {
  return new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });
}
