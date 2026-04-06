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
// Format briefing for #socios-360 (CEO/Dirección)
// Data-driven report with AI analysis at the end
// ============================================
export function formatSociosBriefing(briefing: any, rawData?: any): string {
  const date = new Date().toLocaleDateString("es-VE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Caracas",
  });

  const fmtUsd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBs = (n: number) => `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const parts = [
    `🏢 <b>WUIPI — Reporte Dirección 360°</b>`,
    `📅 ${escHtml(date)}`,
  ];

  // ── 1. SALUD FINANCIERA ──
  parts.push(``, `💰 <b>SALUD FINANCIERA</b>`);

  if (rawData?.finance) {
    const f = rawData.finance;
    if (f.subscriptions) {
      parts.push(`  MRR: <b>${fmtUsd(f.subscriptions.mrr_usd)}</b>`);
    }
    if (f.exchange_rate) {
      parts.push(`  Tasa BCV: <b>${fmtBs(f.exchange_rate)}</b>/USD`);
    }
    if (f.monthly) {
      const m = f.monthly;
      if (m.ved_collected > 0) parts.push(`  Cobrado VED: ${fmtBs(m.ved_collected)} (${m.ved_collection_rate}%)`);
      if (m.usd_collected > 0) parts.push(`  Cobrado USD: ${fmtUsd(m.usd_collected)} (${m.usd_collection_rate}%)`);
    }
  }

  // Cobrado por banco
  if (rawData?.payments_by_journal?.length > 0) {
    parts.push(``, `🏦 <b>COBRADO POR BANCO (mes):</b>`);
    for (const j of rawData.payments_by_journal) {
      const cur = j.currency === "USD" ? fmtUsd(j.total) : fmtBs(j.total);
      parts.push(`  ${j.journal_name}: <b>${cur}</b> (${j.count} mov)`);
    }
  }

  // ── 2. SERVICIOS ──
  parts.push(``);
  if (rawData?.finance?.subscriptions) {
    const s = rawData.finance.subscriptions;
    const total = s.active + s.paused;
    parts.push(`📡 <b>SERVICIOS:</b> ${total} total | <b>${s.active}</b> activos | ${s.paused} suspendidos`);
  }

  // Servicios por categoría (plan)
  if (rawData?.plan_distribution?.length > 0) {
    const plans = rawData.plan_distribution.slice(0, 6);
    const planLines = plans.map((p: any) => `${p.name}: ${p.active}`).join(" | ");
    parts.push(`  ${planLines}`);
  }

  // ── 3. EGRESOS DEL MES ──
  if (rawData?.expenses_month) {
    const e = rawData.expenses_month;
    parts.push(``, `📊 <b>EGRESOS DEL MES:</b> ${fmtUsd(e.total_usd)}`);
    if (e.by_category?.length > 0) {
      for (const c of e.by_category) {
        parts.push(`  ${c.category}: ${fmtUsd(c.total_usd)} (${c.pct}%)`);
      }
    }
  }

  // ── 4. SOPORTE ──
  if (rawData?.soporte) {
    const s = rawData.soporte;
    parts.push(``, `🎧 <b>SOPORTE (30d):</b> ${s.total} tickets | ${s.active} activos | ${s.resolved_today} resueltos hoy`);
    if (s.unique_clients > 0) {
      parts.push(`  👥 Clientes únicos: <b>${s.unique_clients}</b>`);
    }
    if (s.by_category && Object.keys(s.by_category).length > 0) {
      const total = Object.values(s.by_category).reduce((a: number, b: any) => a + b, 0) as number;
      const sorted = Object.entries(s.by_category).sort((a: any, b: any) => b[1] - a[1]);
      const catLines = sorted.map(([k, v]: any) => {
        const pct = total > 0 ? Math.round((v / total) * 100) : 0;
        return `${k}: ${pct}%`;
      });
      parts.push(`  📋 Razones: ${catLines.join(" | ")}`);
    }
  }

  // ── 5. CUENTAS POR COBRAR ──
  if (rawData?.finance?.accounts_receivable) {
    const ar = rawData.finance.accounts_receivable;
    parts.push(``, `📄 <b>CxC:</b> ${fmtUsd(ar.total_pending_amount)} pendiente (${ar.total_customers_with_debt} clientes)`);
  }

  // ── 6. ANÁLISIS IA ──
  if (briefing.summary) {
    parts.push(``, `💡 <b>ANÁLISIS:</b>`, escHtml(briefing.summary));
  }

  // Insights (top 3)
  const insights = (briefing.insights || []).slice(0, 3);
  if (insights.length > 0) {
    parts.push(``, `🎯 <b>INSIGHTS:</b>`);
    for (const ins of insights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} ${escHtml(ins.title)}`);
    }
  }

  const engine = briefing.engine === "dual" ? "Gemini + Claude" : briefing.engine || "IA";
  parts.push(``, `🤖 ${engine} | ${timeNow()}`);

  return parts.join("\n");
}

// ============================================
// Format for #operaciones (infra + soporte)
// ============================================
export function formatOperacionesBriefing(briefing: any, rawData?: any): string {
  // Strict filter: only insights explicitly for operaciones, or infra/soporte without specific "para"
  const insights = (briefing.insights || [])
    .filter((ins: any) =>
      ins.para === "operaciones" ||
      (!ins.para && (ins.category === "infraestructura" || ins.category === "soporte"))
    )
    .slice(0, 5);

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

  // Infrastructure details from raw data
  if (rawData?.infra) {
    const i = rawData.infra;
    parts.push(`📡 <b>RED:</b> ${i.hostsUp}/${i.totalHosts} hosts online | Health: ${i.healthScore}%`);
    if (i.hostsDown > 0) parts.push(`🔴 <b>${i.hostsDown} hosts caidos</b>`);
  }

  // List actual down hosts / critical problems
  if (rawData?.problems?.length > 0) {
    const critical = rawData.problems.filter((p: any) => p.severity === "high" || p.severity === "disaster");
    const warnings = rawData.problems.filter((p: any) => p.severity === "warning" || p.severity === "average");

    if (critical.length > 0) {
      parts.push(``, `🚨 <b>PROBLEMAS CRITICOS (${critical.length}):</b>`);
      for (const p of critical.slice(0, 10)) {
        const mins = Math.round(p.duration / 60);
        const durLabel = mins > 60 ? `${Math.round(mins / 60)}h ${mins % 60}m` : `${mins}m`;
        parts.push(`  🔴 <b>${escHtml(p.hostName)}</b> (${escHtml(p.site)})`);
        parts.push(`     ${escHtml(p.name)} — ${durLabel}`);
      }
    }
    if (warnings.length > 0) {
      parts.push(``, `⚠️ <b>ADVERTENCIAS (${warnings.length}):</b>`);
      for (const p of warnings.slice(0, 5)) {
        parts.push(`  🟡 ${escHtml(p.hostName)}: ${escHtml(p.name)}`);
      }
      if (warnings.length > 5) parts.push(`  ... y ${warnings.length - 5} mas`);
    }
  }

  // Mikrotik nodes with % MRR (no dollar amounts)
  if (rawData?.mikrotik_nodes?.length > 0) {
    const totalMrr = rawData.mikrotik_nodes.reduce((s: number, n: any) => s + (n.mrr_usd || 0), 0);
    const nodesDown = rawData.mikrotik_nodes.filter((n: any) => n.services_suspended > 0);
    if (nodesDown.length > 0) {
      parts.push(``, `📊 <b>NODOS CON SUSPENSIONES:</b>`);
      for (const n of nodesDown.slice(0, 8)) {
        const pctMrr = totalMrr > 0 ? Math.round((n.mrr_usd / totalMrr) * 1000) / 10 : 0;
        const pctSusp = Math.round((n.services_suspended / (n.services_active + n.services_suspended)) * 100);
        parts.push(`  📡 <b>${escHtml(n.name)}</b>: ${n.services_active} act / ${n.services_suspended} susp (${pctSusp}%) — ${pctMrr}% del MRR`);
      }
    }
  }

  // Soporte summary
  if (rawData?.soporte) {
    const s = rawData.soporte;
    parts.push(``, `🎧 <b>SOPORTE:</b> ${s.active} tickets activos | ${s.open} nuevos | ${s.resolved_today} resueltos hoy`);
    if (s.by_category && Object.keys(s.by_category).length > 0) {
      const sorted = Object.entries(s.by_category).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);
      parts.push(`  Razones: ${sorted.map(([k, v]) => `${k}: ${v}`).join(", ")}`);
    }
  }

  if (kpis.eficiencia_soporte) parts.push(``, `📊 Eficiencia soporte: <b>${kpis.eficiencia_soporte.value}</b> (${trendLabel(kpis.eficiencia_soporte.trend)})`);
  if (kpis.riesgo_operativo) parts.push(`⚠️ Riesgo operativo: <b>${kpis.riesgo_operativo.value}</b> (${trendLabel(kpis.riesgo_operativo.trend)})`);

  if (sanitizedInsights.length > 0) {
    parts.push(``, `💡 <b>INSIGHTS IA:</b>`);
    for (const ins of sanitizedInsights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} ${escHtml(ins.title)}`);
      parts.push(`   ${escHtml(ins.description)}`);
    }
  }

  const rec = briefing.recomendaciones_por_area?.operaciones;
  if (rec) parts.push(``, `🎯 <b>Recomendacion:</b> ${escHtml(removeDollarAmounts(rec))}`);

  parts.push(``, `🤖 Supervisor IA | ${timeNow()}`);
  return parts.join("\n");
}

// ============================================
// Format for #finanzas — Gerencia de Finanzas
// ============================================
export function formatFinanzasBriefing(briefing: any, rawData?: any): string {
  const fmtUsd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBs = (n: number) => `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const insights = (briefing.insights || [])
    .filter((ins: any) => ins.para === "finanzas" || (!ins.para && ins.category === "finanzas"))
    .slice(0, 3);

  const parts = [
    `💰 <b>FINANZAS — Reporte Diario</b>`,
    ``,
  ];

  // ── MRR ──
  if (rawData?.finance?.subscriptions) {
    parts.push(`📊 <b>MRR:</b> ${fmtUsd(rawData.finance.subscriptions.mrr_usd)}`);
  }

  // ── INGRESOS DEL MES (cobrado por banco) ──
  if (rawData?.payments_by_journal?.length > 0) {
    parts.push(``, `🏦 <b>INGRESOS DEL MES (por banco):</b>`);
    let totalCobrado = 0;
    for (const j of rawData.payments_by_journal) {
      const cur = j.currency === "USD" ? fmtUsd(j.total) : fmtBs(j.total);
      parts.push(`  ${j.journal_name}: <b>${cur}</b> (${j.count} mov)`);
      totalCobrado += j.total;
    }
    if (rawData.payments_by_journal.length > 1) {
      parts.push(`  <b>Total: ${fmtBs(totalCobrado)}</b>`);
    }
  }

  // ── EGRESOS DEL MES ──
  if (rawData?.expenses_month) {
    const e = rawData.expenses_month;
    parts.push(``, `📊 <b>EGRESOS DEL MES:</b> ${fmtUsd(e.total_usd)}`);
    if (e.by_category?.length > 0) {
      for (const c of e.by_category) {
        parts.push(`  ${c.category}: ${fmtUsd(c.total_usd)} (${c.pct}%)`);
      }
    }
  }

  // ── CxC ──
  if (rawData?.finance?.accounts_receivable) {
    const ar = rawData.finance.accounts_receivable;
    parts.push(``, `📄 <b>CUENTAS POR COBRAR:</b> ${fmtUsd(ar.total_pending_amount)} (${ar.total_customers_with_debt} clientes)`);
  }

  // ── ANÁLISIS + INSIGHTS ──
  if (briefing.summary) {
    parts.push(``, `💡 <b>ANÁLISIS:</b>`, escHtml(briefing.summary));
  }

  if (insights.length > 0) {
    parts.push(``, `🎯 <b>INSIGHTS:</b>`);
    for (const ins of insights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} ${escHtml(ins.title)}`);
    }
  }

  parts.push(``, `🤖 Supervisor IA | ${timeNow()}`);
  return parts.join("\n");
}

// ============================================
// Format for #comercial — Gerencia Comercial
// ============================================
export function formatComercialBriefing(briefing: any, rawData?: any): string {
  const fmtUsd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBs = (n: number) => `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const insights = (briefing.insights || [])
    .filter((ins: any) => ins.para === "comercial" || (!ins.para && (ins.category === "ventas" || ins.category === "clientes")))
    .slice(0, 3);

  const parts = [
    `📈 <b>COMERCIAL — Reporte Diario</b>`,
    ``,
  ];

  // ── CxC GENERAL ──
  if (rawData?.finance?.accounts_receivable) {
    const ar = rawData.finance.accounts_receivable;
    parts.push(`📄 <b>CUENTAS POR COBRAR:</b> ${fmtUsd(ar.total_pending_amount)} (${ar.total_customers_with_debt} clientes)`);
  }

  // ── COBRADO HASTA HOY (por banco) ──
  if (rawData?.payments_by_journal?.length > 0) {
    parts.push(``, `🏦 <b>COBRADO DEL MES (por banco):</b>`);
    for (const j of rawData.payments_by_journal) {
      const cur = j.currency === "USD" ? fmtUsd(j.total) : fmtBs(j.total);
      parts.push(`  ${j.journal_name}: <b>${cur}</b> (${j.count} mov)`);
    }
  }

  // ── SERVICIOS ──
  if (rawData?.finance?.subscriptions) {
    const s = rawData.finance.subscriptions;
    const total = s.active + s.paused;
    parts.push(``, `📡 <b>SERVICIOS:</b> ${total} total | <b>${s.active}</b> activos | ${s.paused} suspendidos`);
  }

  // ── PERIODICIDAD CxC (aging) ──
  if (rawData?.finance?.accounts_receivable?.aging) {
    const a = rawData.finance.accounts_receivable.aging;
    parts.push(``, `⏱ <b>ANTIGÜEDAD CxC:</b>`);
    if (a.current.count > 0) parts.push(`  Vigente: ${fmtUsd(a.current.amount)} (${a.current.count} clientes)`);
    if (a.days30.count > 0) parts.push(`  1-30 días: ${fmtUsd(a.days30.amount)} (${a.days30.count} clientes)`);
    if (a.days60.count > 0) parts.push(`  31-60 días: ${fmtUsd(a.days60.amount)} (${a.days60.count} clientes)`);
    if (a.days90.count > 0) parts.push(`  61-90 días: ${fmtUsd(a.days90.amount)} (${a.days90.count} clientes)`);
    if (a.over90.count > 0) parts.push(`  🔴 +90 días: ${fmtUsd(a.over90.amount)} (${a.over90.count} clientes)`);
  }

  // ── TOP 10 DEUDORES ──
  if (rawData?.finance?.accounts_receivable?.top_debtors?.length > 0) {
    const debtors = rawData.finance.accounts_receivable.top_debtors;
    parts.push(``, `🔝 <b>TOP 10 MAYOR DEUDA:</b>`);
    for (let i = 0; i < Math.min(debtors.length, 10); i++) {
      const d = debtors[i];
      parts.push(`  ${i + 1}. ${escHtml(d.name)}: ${fmtUsd(d.amount)}`);
    }
  }

  // ── VENTAS DEL MES ──
  if (rawData?.leads) {
    const l = rawData.leads;
    parts.push(``, `🎯 <b>VENTAS DEL MES:</b>`);
    parts.push(`  Ganados: <b>${l.won_this_month}</b> | Nuevos leads: ${l.created_this_month}`);
    parts.push(`  Pipeline: ${l.active} activos | ${fmtUsd(l.pipeline_value || 0)}`);

    // Por instalar
    if (l.by_stage?.en_instalacion) {
      parts.push(`  🔧 Por instalar: <b>${l.by_stage.en_instalacion.count}</b>`);
    }
  }

  // Servicios por plan
  if (rawData?.plan_distribution?.length > 0) {
    parts.push(``, `📦 <b>DISTRIBUCIÓN POR PLAN:</b>`);
    for (const cat of rawData.plan_distribution.slice(0, 8)) {
      parts.push(`  ${escHtml(cat.category)}: <b>${cat.active}</b> activos / ${cat.paused} susp (${cat.total} total)`);
    }
  }

  // ── ANÁLISIS + INSIGHTS ──
  if (briefing.summary) {
    parts.push(``, `💡 <b>ANÁLISIS:</b>`, escHtml(briefing.summary));
  }

  if (insights.length > 0) {
    parts.push(``, `🎯 <b>INSIGHTS:</b>`);
    for (const ins of insights) {
      const icon = ins.severity === "critical" ? "🔴" : ins.severity === "high" ? "🟠" : "🟡";
      parts.push(`${icon} ${escHtml(ins.title)}`);
    }
  }

  parts.push(``, `🤖 Supervisor IA | ${timeNow()}`);
  return parts.join("\n");
}

// ============================================
// Send briefing to all configured channels
// ============================================
export async function sendBriefingToAllChannels(briefing: any, rawData?: any): Promise<{
  sent: string[];
  failed: string[];
}> {
  const channels = getChannels();
  const sent: string[] = [];
  const failed: string[] = [];

  const sends: Array<{ name: string; chatId: string | null; format: (b: any, d?: any) => string }> = [
    { name: "socios", chatId: channels.socios, format: (b, d) => formatSociosBriefing(b, d) },
    { name: "operaciones", chatId: channels.operaciones, format: (b, d) => formatOperacionesBriefing(b, d) },
    { name: "finanzas", chatId: channels.finanzas, format: (b, d) => formatFinanzasBriefing(b, d) },
    { name: "comercial", chatId: channels.comercial, format: (b, d) => formatComercialBriefing(b, d) },
  ];

  for (const { name, chatId, format } of sends) {
    if (!chatId) {
      console.log(`[Telegram] Skipping #${name} — no channel ID configured`);
      continue;
    }
    try {
      const text = format(briefing, rawData);
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
