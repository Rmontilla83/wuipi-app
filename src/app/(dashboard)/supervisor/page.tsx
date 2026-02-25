"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard";
import type { AISupervisorData, AIMessage, AIInsight } from "@/types/ai";
import {
  Brain, RefreshCw, ChevronDown, ChevronUp, Send, Sparkles,
  AlertTriangle, Lightbulb, MessageSquare, Clock,
} from "lucide-react";

const priorityConfig = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/25", accent: "text-red-400", label: "Crítico" },
  high: { bg: "bg-orange-500/10", border: "border-orange-500/25", accent: "text-orange-400", label: "Alto" },
  medium: { bg: "bg-amber-500/10", border: "border-amber-500/25", accent: "text-amber-400", label: "Medio" },
  low: { bg: "bg-blue-500/10", border: "border-blue-500/25", accent: "text-blue-400", label: "Bajo" },
};

function InsightCard({ insight, expanded, onToggle }: { insight: AIInsight; expanded: boolean; onToggle: () => void }) {
  const pc = priorityConfig[insight.priority];
  const timeAgo = (ts: string) => {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  return (
    <div
      onClick={onToggle}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${expanded ? `${pc.bg} ${pc.border}` : "bg-wuipi-bg border-wuipi-border hover:border-wuipi-accent/20"}`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${pc.accent.replace("text-", "bg-")} ${insight.priority === "critical" ? "shadow-[0_0_8px] shadow-red-400" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${insight.engine === "claude" ? "bg-violet-500/10 text-violet-400" : "bg-cyan-500/10 text-cyan-400"}`}>
              {insight.engine}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pc.bg} ${pc.accent}`}>{pc.label}</span>
            <span className="text-[10px] text-gray-600">{timeAgo(insight.timestamp)}</span>
          </div>
          <p className="text-sm font-semibold text-white leading-tight">{insight.title}</p>

          {expanded && (
            <div className="mt-3 space-y-3 animate-fade-in">
              <p className="text-sm text-gray-300 leading-relaxed">{insight.body}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {insight.modules.map((m) => (
                  <span key={m} className="px-2 py-0.5 bg-wuipi-card rounded text-[10px] text-gray-400 border border-wuipi-border">{m}</span>
                ))}
                <span className="text-[10px] text-gray-600 ml-auto">Confianza: {insight.confidence}%</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {insight.actions.map((a) => (
                  <button key={a} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${pc.bg} ${pc.accent} border ${pc.border} hover:opacity-80 transition-opacity`}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-500 mt-1" /> : <ChevronDown size={14} className="text-gray-500 mt-1" />}
      </div>
    </div>
  );
}

export default function SupervisorPage() {
  const [data, setData] = useState<AISupervisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefingExpanded, setBriefingExpanded] = useState(true);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AIMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/briefing");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error fetching AI data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSend = async (text?: string) => {
    const msg = text || chatInput;
    if (!msg.trim() || isTyping) return;

    const userMsg: AIMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/ai/chat", {
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
        engine,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", content: "Error al consultar. Intenta de nuevo.", engine: "claude", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (loading || !data) {
    return (
      <>
        <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-violet-400" />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <Sparkles size={20} className="animate-pulse text-violet-400" />
            <span>Inicializando Supervisor IA...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-violet-400" />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* AI Header */}
        <div className="bg-gradient-to-r from-violet-500/5 to-cyan-500/5 border border-violet-500/20 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-2xl shadow-lg shadow-violet-500/20">
              🧠
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Supervisor IA</h2>
              <p className="text-sm text-gray-400">COO Virtual · Claude + Gemini · Monitoreo 360°</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400 glow-dot" />
              <span className="text-xs font-semibold text-emerald-400">Activo</span>
            </div>
          </div>
        </div>

        {/* Briefing */}
        <Card className="overflow-hidden">
          <button onClick={() => setBriefingExpanded(!briefingExpanded)} className="w-full flex items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <span className="text-lg">📋</span>
              <div>
                <p className="text-base font-bold text-white">Briefing del Día</p>
                <p className="text-xs text-gray-500">{data.briefing.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-xl font-extrabold ${data.briefing.overall_score >= 85 ? "text-emerald-400" : "text-amber-400"}`}>
                {data.briefing.overall_score}/100
              </span>
              {briefingExpanded ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
            </div>
          </button>

          {briefingExpanded && (
            <div className="mt-4 pt-4 border-t border-wuipi-border space-y-4 animate-fade-in">
              <div className="grid grid-cols-4 gap-3">
                {data.briefing.key_metrics.map((m) => (
                  <div key={m.label} className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-xs text-gray-500">{m.icon} {m.label}</p>
                    <p className="text-lg font-bold text-white">{m.value}</p>
                    <p className={`text-xs font-semibold ${m.trend === "up" ? "text-emerald-400" : m.trend === "down" ? "text-red-400" : "text-gray-500"}`}>
                      {m.trend === "up" ? "↑ Mejorando" : m.trend === "down" ? "↓ Bajando" : "→ Estable"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-wuipi-bg rounded-lg border border-wuipi-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded text-[10px] font-bold uppercase">{data.briefing.engine}</span>
                  <span className="text-[10px] text-gray-600">Generado a las 7:00 AM</span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{data.briefing.summary}</p>
              </div>
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
              <span className="text-xs text-gray-500">{data.insights.length} activos</span>
            </div>
            <div className="flex-1 overflow-auto space-y-3 pr-1">
              {data.insights.map((ins) => (
                <InsightCard
                  key={ins.id} insight={ins}
                  expanded={expandedInsight === ins.id}
                  onToggle={() => setExpandedInsight(expandedInsight === ins.id ? null : ins.id)}
                />
              ))}
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
                  <div className="text-4xl mb-3">🧠</div>
                  <p className="text-sm font-semibold text-white mb-1">Pregúntame lo que quieras</p>
                  <p className="text-xs text-gray-500 mb-5">Acceso a datos de red, soporte, finanzas y clientes</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {data.suggested_questions.map((q) => (
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

              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-cyan-500/10 to-violet-500/10 border border-cyan-500/20 rounded-br-sm"
                      : "bg-wuipi-bg border border-wuipi-border rounded-bl-sm"
                  }`}>
                    {msg.role === "assistant" && msg.engine && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          msg.engine === "claude" ? "bg-violet-500/10 text-violet-400" : "bg-cyan-500/10 text-cyan-400"
                        }`}>{msg.engine}</span>
                        <span className="text-[10px] text-gray-600">Supervisor IA</span>
                      </div>
                    )}
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-2xl rounded-bl-sm flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-2 h-2 rounded-full bg-violet-400" style={{
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                          opacity: 0.4,
                        }} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">Analizando...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 pt-3 border-t border-wuipi-border">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Pregunta sobre la operación..."
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

        <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }`}</style>
      </div>
    </>
  );
}
