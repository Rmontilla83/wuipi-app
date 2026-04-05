"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import type { AIMessage } from "@/types/ai";
import {
  Brain, RefreshCw, ChevronDown, ChevronUp, Send, Sparkles,
  AlertTriangle, Lightbulb, MessageSquare, TrendingUp, TrendingDown,
  Minus, Shield, Headphones, ShoppingCart, Users, Server,
  AlertCircle, DollarSign, SendHorizonal, History, Calendar,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ============================================
// TYPES
// ============================================
interface BriefingKPI {
  value: string;
  label: string;
  trend: "up" | "down" | "stable";
}

interface BriefingInsight {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  category: "infraestructura" | "soporte" | "ventas" | "clientes" | "finanzas";
  para?: "operaciones" | "finanzas" | "comercial" | "todos";
}

interface BriefingData {
  score: number;
  score_trend: "stable" | "improving" | "declining";
  kpis: {
    salud_general: BriefingKPI;
    riesgo_operativo: BriefingKPI;
    eficiencia_soporte: BriefingKPI;
    crecimiento: BriefingKPI;
    salud_financiera?: BriefingKPI;
  };
  summary: string;
  insights: BriefingInsight[];
  recomendaciones_por_area?: {
    operaciones?: string;
    finanzas?: string;
    comercial?: string;
  };
  generated_at: string;
  engine: string;
  engines_used?: { analysis: string | null; strategy: string | null };
  sources: Record<string, boolean>;
}

// ============================================
// CONFIG
// ============================================
const SEVERITY_CONFIG = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/25", accent: "text-red-400", dot: "bg-red-400", label: "Critico", glow: true },
  high: { bg: "bg-orange-500/10", border: "border-orange-500/25", accent: "text-orange-400", dot: "bg-orange-400", label: "Alto", glow: false },
  medium: { bg: "bg-amber-500/10", border: "border-amber-500/25", accent: "text-amber-400", dot: "bg-amber-400", label: "Medio", glow: false },
  low: { bg: "bg-blue-500/10", border: "border-blue-500/25", accent: "text-blue-400", dot: "bg-blue-400", label: "Bajo", glow: false },
};

const CATEGORY_ICONS: Record<string, typeof Server> = {
  infraestructura: Server,
  soporte: Headphones,
  ventas: ShoppingCart,
  clientes: Users,
  finanzas: DollarSign,
};

// Engine badge styles
function EngineBadge({ engine }: { engine: string }) {
  if (engine === "dual") {
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gradient-to-r from-emerald-500/10 to-violet-500/10 text-cyan-400">
        GEMINI + CLAUDE
      </span>
    );
  }
  const isGemini = engine === "gemini";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
      isGemini ? "bg-emerald-500/10 text-emerald-400" : "bg-violet-500/10 text-violet-400"
    }`}>
      {engine}
    </span>
  );
}

const PARA_LABELS: Record<string, { label: string; color: string }> = {
  operaciones: { label: "Gte. Operaciones", color: "bg-amber-500/10 text-amber-400" },
  finanzas: { label: "Gte. Finanzas", color: "bg-emerald-500/10 text-emerald-400" },
  comercial: { label: "Gte. Comercial", color: "bg-violet-500/10 text-violet-400" },
  todos: { label: "Todos", color: "bg-cyan-500/10 text-cyan-400" },
};

const SUGGESTED_QUESTIONS = [
  "Dame un resumen ejecutivo",
  "¿Qué nodos necesitan atencion?",
  "¿Cuantos tickets hay sin asignar?",
  "¿Como va el pipeline de ventas?",
  "¿Como esta la salud financiera?",
  "¿Quienes son los mayores morosos?",
  "¿Cual es el MRR actual y tasa de cobranza?",
];

// ============================================
// INSIGHT CARD
// ============================================
function InsightCard({ insight, expanded, onToggle, engine }: {
  insight: BriefingInsight;
  expanded: boolean;
  onToggle: () => void;
  engine?: string;
}) {
  const sc = SEVERITY_CONFIG[insight.severity];
  const CatIcon = CATEGORY_ICONS[insight.category] || AlertTriangle;

  return (
    <div
      onClick={onToggle}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        expanded ? `${sc.bg} ${sc.border}` : "bg-wuipi-bg border-wuipi-border hover:border-wuipi-accent/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${sc.dot} ${sc.glow ? "shadow-[0_0_8px] shadow-red-400" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${sc.bg} ${sc.accent}`}>{sc.label}</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-600">
              <CatIcon size={10} /> {insight.category}
            </span>
            {insight.para && PARA_LABELS[insight.para] && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PARA_LABELS[insight.para].color}`}>
                {PARA_LABELS[insight.para].label}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white leading-tight">{insight.title}</p>
          {expanded && (
            <p className="mt-2 text-sm text-gray-300 leading-relaxed animate-fade-in">{insight.description}</p>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-500 mt-1" /> : <ChevronDown size={14} className="text-gray-500 mt-1" />}
      </div>
    </div>
  );
}

// ============================================
// KPI CARD
// ============================================
function KPICard({ kpi, icon }: { kpi: BriefingKPI; icon: string }) {
  const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Minus;
  const trendColor = kpi.trend === "up" ? "text-emerald-400" : kpi.trend === "down" ? "text-red-400" : "text-gray-500";
  const trendLabel = kpi.trend === "up" ? "Mejorando" : kpi.trend === "down" ? "Bajando" : "Estable";

  return (
    <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
      <p className="text-xs text-gray-500">{icon} {kpi.label}</p>
      <p className="text-lg font-bold text-white">{kpi.value}</p>
      <p className={`text-xs font-semibold ${trendColor} flex items-center gap-1`}>
        <TrendIcon size={12} /> {trendLabel}
      </p>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function SupervisorPage() {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<AIMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Client count for header
  const [clientCount, setClientCount] = useState<number | null>(null);

  // Telegram state
  const [telegramConfig, setTelegramConfig] = useState<{ configured: boolean; channels: Record<string, boolean> } | null>(null);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramResult, setTelegramResult] = useState<{ sent: string[]; failed: string[] } | null>(null);

  // History state
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [selectedBriefing, setSelectedBriefing] = useState<any | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  // ============================================
  // FETCH BRIEFING
  // ============================================
  const fetchBriefing = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      // Check sessionStorage cache
      if (!isRefresh) {
        const cached = sessionStorage.getItem("supervisor_briefing");
        if (cached) {
          const parsed = JSON.parse(cached);
          // Use cache if less than 10 min old
          if (Date.now() - parsed._cachedAt < 10 * 60 * 1000) {
            setBriefing(parsed);
            setLoading(false);
            return;
          }
        }
      }

      const res = await fetch("/api/supervisor/briefing", { method: "POST" });

      if (res.status === 503) {
        setError("not_configured");
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al generar briefing");
      }

      const data = await res.json();
      setBriefing(data);

      // Cache in session
      sessionStorage.setItem("supervisor_briefing", JSON.stringify({ ...data, _cachedAt: Date.now() }));
    } catch (err: any) {
      console.error("[Supervisor] Briefing error:", err);
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch client count + telegram config + history
  useEffect(() => {
    fetch("/api/supervisor/data")
      .then(r => r.json())
      .then(d => { if (d.clients?.total) setClientCount(d.clients.total); })
      .catch(() => {});
    fetch("/api/supervisor/telegram")
      .then(r => r.json())
      .then(d => setTelegramConfig(d))
      .catch(() => {});
    fetch("/api/supervisor/history?limit=30")
      .then(r => r.json())
      .then(d => { if (d.briefings) setHistoryData(d.briefings); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

  // ============================================
  // CHAT
  // ============================================
  const handleSend = async (text?: string) => {
    const msg = text || chatInput;
    if (!msg.trim() || isTyping) return;

    const userMsg: AIMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/supervisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: chatMessages.slice(-10),
        }),
      });
      const { content, engine } = await res.json();

      const aiMsg: AIMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content,
        engine: engine || "claude",
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch {
      setChatMessages(prev => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "Error al consultar. Intenta de nuevo.", engine: "gemini" as const, timestamp: new Date().toISOString() },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // ============================================
  // RENDER — NOT CONFIGURED
  // ============================================
  if (error === "not_configured") {
    return (
      <>
        <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-violet-400" />} />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="!p-8 text-center max-w-md">
            <AlertCircle size={48} className="mx-auto mb-4 text-amber-400" />
            <h3 className="text-lg font-bold text-white mb-2">Supervisor IA no configurado</h3>
            <p className="text-sm text-gray-400 mb-4">
              Para activar el Supervisor IA, agrega <code className="text-emerald-400">GEMINI_API_KEY</code> y/o <code className="text-violet-400">ANTHROPIC_API_KEY</code> en la configuracion del proyecto.
            </p>
          </Card>
        </div>
      </>
    );
  }

  // ============================================
  // RENDER — LOADING
  // ============================================
  if (loading) {
    return (
      <>
        <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-violet-400" />} />
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* Header skeleton */}
          <div className="bg-gradient-to-r from-violet-500/5 to-cyan-500/5 border border-violet-500/20 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-500/30 animate-pulse" />
              <div>
                <div className="h-5 w-40 bg-wuipi-border rounded animate-pulse mb-2" />
                <div className="h-4 w-56 bg-wuipi-border/50 rounded animate-pulse" />
              </div>
            </div>
          </div>

          {/* Briefing skeleton */}
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <Sparkles size={20} className="animate-pulse text-violet-400" />
              <span className="text-sm text-gray-400">Generando briefing dual — Gemini analiza datos, Claude correlaciona y recomienda...</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                  <div className="h-3 w-20 bg-wuipi-border rounded animate-pulse mb-2" />
                  <div className="h-6 w-16 bg-wuipi-border/70 rounded animate-pulse mb-1" />
                  <div className="h-3 w-14 bg-wuipi-border/50 rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="p-4 bg-wuipi-bg rounded-lg border border-wuipi-border space-y-2">
              <div className="h-3 w-full bg-wuipi-border/50 rounded animate-pulse" />
              <div className="h-3 w-4/5 bg-wuipi-border/50 rounded animate-pulse" />
              <div className="h-3 w-3/5 bg-wuipi-border/50 rounded animate-pulse" />
            </div>
          </Card>

          {/* Insights + Chat skeleton */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-wuipi-bg rounded-xl border border-wuipi-border animate-pulse" />
              ))}
            </Card>
            <Card className="flex items-center justify-center">
              <p className="text-sm text-gray-500">El chat estara disponible cuando el briefing se genere</p>
            </Card>
          </div>
        </div>
      </>
    );
  }

  // ============================================
  // RENDER — ERROR
  // ============================================
  if (error && !briefing) {
    return (
      <>
        <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-violet-400" />} />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="!p-8 text-center max-w-md">
            <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
            <h3 className="text-lg font-bold text-white mb-2">Error al generar briefing</h3>
            <p className="text-sm text-gray-400 mb-4">{error}</p>
            <button
              onClick={() => fetchBriefing()}
              className="px-4 py-2 bg-wuipi-accent text-black rounded-lg text-sm font-semibold hover:bg-wuipi-accent/90"
            >
              Reintentar
            </button>
          </Card>
        </div>
      </>
    );
  }

  if (!briefing) return null;

  const generatedTime = new Date(briefing.generated_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-violet-400" />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* AI Header */}
        <div className="bg-gradient-to-r from-violet-500/5 to-cyan-500/5 border border-violet-500/20 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Brain size={28} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Supervisor IA</h2>
              <p className="text-sm text-gray-400">
                COO Virtual · Gemini Flash + Claude Sonnet
                {clientCount !== null && <span className="ml-2 text-gray-500">· {clientCount} clientes</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {telegramConfig?.configured && briefing && (
              <button
                onClick={async () => {
                  setSendingTelegram(true);
                  setTelegramResult(null);
                  try {
                    const res = await fetch("/api/supervisor/telegram", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ briefing }),
                    });
                    const data = await res.json();
                    setTelegramResult({ sent: data.sent || [], failed: data.failed || [] });
                    setTimeout(() => setTelegramResult(null), 5000);
                  } catch { setTelegramResult({ sent: [], failed: ["error"] }); }
                  finally { setSendingTelegram(false); }
                }}
                disabled={sendingTelegram}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
              >
                <SendHorizonal size={14} className={sendingTelegram ? "animate-pulse" : ""} />
                {sendingTelegram ? "Enviando..." : telegramResult ? `Enviado a ${telegramResult.sent.length} canales` : "Enviar a Telegram"}
              </button>
            )}
            <button
              onClick={() => fetchBriefing(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Generando..." : "Regenerar"}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">IA Activa</span>
            </div>
          </div>
        </div>

        {/* Briefing */}
        <Card className="overflow-hidden">
          <button onClick={() => setBriefingExpanded(!briefingExpanded)} className="w-full flex items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-violet-400" />
              <div>
                <p className="text-base font-bold text-white">Briefing del Dia</p>
                <p className="text-xs text-gray-500">
                  {new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-xl font-extrabold ${briefing.score >= 80 ? "text-emerald-400" : briefing.score >= 50 ? "text-amber-400" : "text-red-400"}`}>
                {briefing.score}/100
              </span>
              {briefingExpanded ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
            </div>
          </button>

          {briefingExpanded && (
            <div className="mt-4 pt-4 border-t border-wuipi-border space-y-4 animate-fade-in">
              {/* KPIs */}
              <div className="grid grid-cols-5 gap-3">
                {briefing.kpis.salud_general && <KPICard kpi={briefing.kpis.salud_general} icon="🏢" />}
                {briefing.kpis.riesgo_operativo && <KPICard kpi={briefing.kpis.riesgo_operativo} icon="⚠️" />}
                {briefing.kpis.eficiencia_soporte && <KPICard kpi={briefing.kpis.eficiencia_soporte} icon="🎧" />}
                {briefing.kpis.crecimiento && <KPICard kpi={briefing.kpis.crecimiento} icon="📈" />}
                {briefing.kpis.salud_financiera && <KPICard kpi={briefing.kpis.salud_financiera} icon="💰" />}
              </div>

              {/* Summary */}
              <div className="p-4 bg-wuipi-bg rounded-lg border border-wuipi-border">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <EngineBadge engine={briefing.engine} />
                  <span className="text-[10px] text-gray-600">Generado a las {generatedTime}</span>
                  {briefing.engines_used && (
                    <span className="text-[10px] text-gray-600">
                      (Analisis: {briefing.engines_used.analysis || "—"}, Estrategia: {briefing.engines_used.strategy || "—"})
                    </span>
                  )}
                  {briefing.sources && Object.entries(briefing.sources).map(([key, ok]) => (
                    <span key={key} className={`px-1.5 py-0.5 rounded text-[10px] ${ok ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"}`}>
                      {key}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{briefing.summary}</p>
              </div>

              {/* Recommendations per area */}
              {briefing.recomendaciones_por_area && (
                <div className="grid grid-cols-3 gap-3">
                  {briefing.recomendaciones_por_area.operaciones && (
                    <div className="p-3 bg-wuipi-bg rounded-lg border border-amber-500/20">
                      <p className="text-[10px] font-bold text-amber-400 mb-1">Gte. Operaciones</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{briefing.recomendaciones_por_area.operaciones}</p>
                    </div>
                  )}
                  {briefing.recomendaciones_por_area.finanzas && (
                    <div className="p-3 bg-wuipi-bg rounded-lg border border-emerald-500/20">
                      <p className="text-[10px] font-bold text-emerald-400 mb-1">Gte. Finanzas</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{briefing.recomendaciones_por_area.finanzas}</p>
                    </div>
                  )}
                  {briefing.recomendaciones_por_area.comercial && (
                    <div className="p-3 bg-wuipi-bg rounded-lg border border-violet-500/20">
                      <p className="text-[10px] font-bold text-violet-400 mb-1">Gte. Comercial</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{briefing.recomendaciones_por_area.comercial}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Insights + Chat */}
        <div className="grid grid-cols-2 gap-4">
          {/* Insights */}
          <Card className="flex flex-col max-h-[600px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lightbulb size={18} /> Insights
              </h3>
              <span className="text-xs text-gray-500">{briefing.insights?.length || 0} detectados</span>
            </div>
            <div className="flex-1 overflow-auto space-y-3 pr-1">
              {briefing.insights?.length > 0 ? (
                briefing.insights.map((ins, idx) => (
                  <InsightCard
                    key={idx}
                    insight={ins}
                    engine={briefing.engine}
                    expanded={expandedInsight === `ins-${idx}`}
                    onToggle={() => setExpandedInsight(expandedInsight === `ins-${idx}` ? null : `ins-${idx}`)}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <Sparkles size={24} className="mx-auto mb-2 text-gray-600" />
                  <p className="text-sm text-gray-500">Sin insights para mostrar</p>
                </div>
              )}
            </div>
          </Card>

          {/* Chat */}
          <Card className="flex flex-col max-h-[600px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MessageSquare size={18} /> Consulta al Supervisor
              </h3>
              <span className="text-xs text-gray-500">Lenguaje natural</span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto space-y-3 pr-1 mb-4">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <Brain size={32} className="mx-auto mb-3 text-violet-400/50" />
                  <p className="text-sm font-semibold text-white mb-1">Preguntame lo que quieras</p>
                  <p className="text-xs text-gray-500 mb-5">Acceso a datos de red, soporte, ventas y clientes</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {SUGGESTED_QUESTIONS.map(q => (
                      <button
                        key={q}
                        onClick={() => handleSend(q)}
                        className="px-3 py-1.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-xs text-gray-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-br-sm"
                      : "bg-wuipi-bg border border-wuipi-border rounded-bl-sm"
                  }`}>
                    {msg.role === "assistant" && msg.engine && (
                      <div className="flex items-center gap-2 mb-2">
                        <EngineBadge engine={msg.engine} />
                        <span className="text-[10px] text-gray-600">Supervisor IA</span>
                      </div>
                    )}
                    <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed prose-sm">
                      {renderMarkdown(msg.content)}
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-2xl rounded-bl-sm flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <span key={i} className="w-2 h-2 rounded-full bg-violet-400" style={{
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                          opacity: 0.4,
                        }} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">Analizando datos...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 pt-3 border-t border-wuipi-border">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder="Pregunta sobre la operacion..."
                className="flex-1 px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-xl text-sm text-white outline-none focus:border-violet-500/50 placeholder:text-gray-600"
              />
              <button
                onClick={() => handleSend()}
                disabled={!chatInput.trim() || isTyping}
                className="px-4 py-2.5 bg-gradient-to-r from-violet-500 to-cyan-500 rounded-xl text-white text-sm font-semibold disabled:opacity-30 hover:opacity-90 transition-opacity"
              >
                <Send size={16} />
              </button>
            </div>
          </Card>
        </div>

        {/* Briefing History */}
        <Card>
          <button onClick={() => setHistoryExpanded(!historyExpanded)} className="w-full flex items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <History size={18} className="text-cyan-400" />
              <div>
                <p className="text-base font-bold text-white">Historial de Briefings</p>
                <p className="text-xs text-gray-500">{historyData.length} briefings registrados</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {historyData.length > 1 && (() => {
                const latest = historyData[0]?.score;
                const prev = historyData[1]?.score;
                if (latest == null || prev == null) return null;
                const delta = latest - prev;
                return (
                  <span className={`text-xs font-bold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-gray-500"}`}>
                    {delta > 0 ? "+" : ""}{delta} vs anterior
                  </span>
                );
              })()}
              {historyExpanded ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
            </div>
          </button>

          {historyExpanded && (
            <div className="mt-4 pt-4 border-t border-wuipi-border space-y-4 animate-fade-in">
              {/* Score trend chart */}
              {historyData.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-3">Tendencia del Score (ultimos {historyData.length} briefings)</p>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...historyData].reverse().map(b => ({
                        date: new Date(b.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", timeZone: "America/Caracas" }),
                        score: b.score,
                        id: b.id,
                      }))}>
                        <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#111827", border: "1px solid #1e293b", borderRadius: 12, fontSize: 12 }}
                          labelStyle={{ color: "#fff", fontWeight: 600 }}
                          formatter={(value: number) => [`${value}/100`, "Score"]}
                        />
                        <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={24} cursor="pointer"
                          onClick={(entry: any) => {
                            const found = historyData.find(b => b.id === entry.id);
                            if (found) setSelectedBriefing(selectedBriefing?.id === found.id ? null : found);
                          }}>
                          {[...historyData].reverse().map((b, i) => (
                            <Cell key={i} fill={b.score >= 80 ? "#10b981" : b.score >= 50 ? "#f59e0b" : "#ef4444"}
                              fillOpacity={selectedBriefing?.id === b.id ? 1 : 0.6} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-gray-600 text-center mt-1">Click en una barra para ver el detalle</p>
                </div>
              )}

              {/* Selected briefing detail */}
              {selectedBriefing && (
                <div className="p-4 bg-wuipi-bg rounded-xl border border-cyan-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-cyan-400" />
                      <span className="text-sm font-bold text-white">
                        {new Date(selectedBriefing.created_at).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Caracas" })}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(selectedBriefing.created_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-extrabold ${selectedBriefing.score >= 80 ? "text-emerald-400" : selectedBriefing.score >= 50 ? "text-amber-400" : "text-red-400"}`}>
                        {selectedBriefing.score}/100
                      </span>
                      <EngineBadge engine={selectedBriefing.engine} />
                    </div>
                  </div>

                  {/* KPIs */}
                  {selectedBriefing.kpis && (
                    <div className="grid grid-cols-5 gap-2">
                      {selectedBriefing.kpis.salud_general && <KPICard kpi={selectedBriefing.kpis.salud_general} icon="🏢" />}
                      {selectedBriefing.kpis.riesgo_operativo && <KPICard kpi={selectedBriefing.kpis.riesgo_operativo} icon="⚠️" />}
                      {selectedBriefing.kpis.eficiencia_soporte && <KPICard kpi={selectedBriefing.kpis.eficiencia_soporte} icon="🎧" />}
                      {selectedBriefing.kpis.crecimiento && <KPICard kpi={selectedBriefing.kpis.crecimiento} icon="📈" />}
                      {selectedBriefing.kpis.salud_financiera && <KPICard kpi={selectedBriefing.kpis.salud_financiera} icon="💰" />}
                    </div>
                  )}

                  {/* Summary */}
                  {selectedBriefing.summary && (
                    <p className="text-sm text-gray-300 leading-relaxed">{selectedBriefing.summary}</p>
                  )}

                  {/* Insights */}
                  {selectedBriefing.insights?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Insights ({selectedBriefing.insights.length})</p>
                      {selectedBriefing.insights.map((ins: any, i: number) => {
                        const sc = SEVERITY_CONFIG[ins.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.low;
                        return (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${sc.dot}`} />
                            <div>
                              <span className="text-white font-medium">{ins.title}</span>
                              <span className="text-gray-500 ml-1">— {ins.description}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Telegram status */}
                  {(selectedBriefing.telegram_sent?.length > 0 || selectedBriefing.telegram_failed?.length > 0) && (
                    <div className="flex items-center gap-3 text-[10px]">
                      {selectedBriefing.telegram_sent?.length > 0 && (
                        <span className="text-emerald-400">Telegram: {selectedBriefing.telegram_sent.join(", ")}</span>
                      )}
                      {selectedBriefing.telegram_failed?.length > 0 && (
                        <span className="text-red-400">Falló: {selectedBriefing.telegram_failed.join(", ")}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {historyData.length === 0 && (
                <div className="text-center py-8">
                  <History size={32} className="mx-auto mb-2 text-gray-600" />
                  <p className="text-sm text-gray-500">Sin historial aun. Los briefings se guardan automaticamente.</p>
                </div>
              )}
            </div>
          )}
        </Card>

        <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }`}</style>
      </div>
    </>
  );
}

// ============================================
// SIMPLE MARKDOWN RENDERER
// ============================================
function renderMarkdown(text: string) {
  // Split into lines and process bold + lists
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bullet list
    if (line.match(/^[-*]\s/)) {
      const content = line.replace(/^[-*]\s/, "");
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-gray-500 shrink-0">·</span>
          <span>{applyBold(content)}</span>
        </div>
      );
    }
    // Numbered list
    else if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+\.)\s(.*)/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2">
            <span className="text-gray-500 shrink-0">{match[1]}</span>
            <span>{applyBold(match[2])}</span>
          </div>
        );
      }
    }
    // Empty line = spacing
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Regular text
    else {
      elements.push(<div key={i}>{applyBold(line)}</div>);
    }
  }

  return <>{elements}</>;
}

function applyBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
