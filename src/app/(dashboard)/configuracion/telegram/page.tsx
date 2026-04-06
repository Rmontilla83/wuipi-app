"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Send, RefreshCw, Save, Check, Loader2, AlertTriangle,
  MessageSquare, TrendingUp, FileText, DollarSign,
  CheckCircle, XCircle, Clock,
} from "lucide-react";

interface TelegramConfig {
  telegram_enabled: boolean;
  briefing_enabled: boolean;
  bcv_alert_enabled: boolean;
  drafts_alert_enabled: boolean;
  bcv_change_pct: number;
  drafts_alert_day_from: number;
  drafts_min_count: number;
}

interface ChannelStatus {
  socios: boolean;
  operaciones: boolean;
  finanzas: boolean;
  comercial: boolean;
}

interface LastBriefing {
  score: number;
  engine: string;
  sent: string[];
  failed: string[];
  date: string;
}

const CHANNEL_LABELS: Record<string, { label: string; desc: string; icon: string }> = {
  socios: { label: "Dirección (Socios 360)", desc: "Briefing completo — todos los KPIs, alertas y recomendaciones", icon: "🏢" },
  operaciones: { label: "Operaciones", desc: "Infraestructura, soporte, nodos Mikrotik — sin montos", icon: "⚙️" },
  finanzas: { label: "Finanzas", desc: "MRR, cobranza, cuentas por cobrar, tasa BCV", icon: "💰" },
  comercial: { label: "Comercial", desc: "Pipeline de ventas, conversión, crecimiento, retención", icon: "📈" },
};

const REPORT_TYPES = [
  { key: "briefing_enabled", label: "Briefing Diario", desc: "Reporte IA completo — 7:00 AM", icon: MessageSquare, color: "text-purple-400 bg-purple-400/10" },
  { key: "bcv_alert_enabled", label: "Alerta Tasa BCV", desc: "Cambio significativo en tasa USD/VES — 9 AM y 3 PM", icon: DollarSign, color: "text-emerald-400 bg-emerald-400/10" },
  { key: "drafts_alert_enabled", label: "Alerta Borradores", desc: "Creación masiva de facturas borrador — Días 27-31", icon: FileText, color: "text-amber-400 bg-amber-400/10" },
] as const;

export default function TelegramConfigPage() {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [original, setOriginal] = useState<TelegramConfig | null>(null);
  const [channels, setChannels] = useState<ChannelStatus | null>(null);
  const [lastBriefing, setLastBriefing] = useState<LastBriefing | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; channel: string } | null>(null);
  const [sendingBriefing, setSendingBriefing] = useState(false);
  const [briefingResult, setBriefingResult] = useState<{ sent: string[]; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracion/telegram");
      if (!res.ok) throw new Error("Error al cargar configuración");
      const data = await res.json();
      setConfig(data.config);
      setOriginal(data.config);
      setChannels(data.channels);
      setLastBriefing(data.last_briefing);
      setConfigured(data.configured);
    } catch {
      setError("No se pudo cargar la configuración de Telegram");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const hasChanges = config && original && JSON.stringify(config) !== JSON.stringify(original);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/configuracion/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }
      setOriginal({ ...config });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel: string) => {
    setTesting(channel);
    setTestResult(null);
    try {
      const res = await fetch("/api/configuracion/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", channel }),
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, channel });
    } catch {
      setTestResult({ ok: false, channel });
    } finally {
      setTesting(null);
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const handleManualBriefing = async () => {
    setSendingBriefing(true);
    setBriefingResult(null);
    try {
      // First get cached briefing from supervisor
      const cacheRes = await fetch("/api/supervisor/briefing");
      if (!cacheRes.ok) throw new Error("No hay briefing en cache");
      const { briefing } = await cacheRes.json();

      const res = await fetch("/api/supervisor/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing }),
      });
      const data = await res.json();
      setBriefingResult({ sent: data.sent || [], failed: data.failed || [] });
    } catch {
      setBriefingResult({ sent: [], failed: ["error"] });
    } finally {
      setSendingBriefing(false);
      setTimeout(() => setBriefingResult(null), 5000);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="Telegram" subtitle="Configuración de reportes" />
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
          <span className="ml-3 text-gray-500 text-sm">Cargando...</span>
        </div>
      </>
    );
  }

  if (!config) {
    return (
      <>
        <TopBar title="Telegram" subtitle="Configuración de reportes" />
        <div className="p-6">
          <Card className="!p-6 text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
            <p className="text-gray-400">{error || "Error al cargar configuración"}</p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Telegram" subtitle="Configuración de reportes y alertas" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-4">

          {error && (
            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* ── Status Card ── */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-wuipi-border flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold text-sm">Estado de conexión</h3>
                <p className="text-gray-500 text-xs">Bot @wuipisuperbot</p>
              </div>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${configured ? "text-emerald-400" : "text-red-400"}`}>
                {configured ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {configured ? "Conectado" : "No configurado"}
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(CHANNEL_LABELS).map(([key, { label, icon }]) => {
                  const active = channels?.[key as keyof ChannelStatus];
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 truncate">{label}</p>
                        <p className={`text-[10px] ${active ? "text-emerald-400" : "text-gray-600"}`}>
                          {active ? "Configurado" : "Sin canal"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleTest(key)}
                        disabled={!active || !!testing}
                        className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                        title={`Enviar test a ${label}`}
                      >
                        {testing === key ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
              {testResult && (
                <div className={`mt-3 px-3 py-1.5 rounded text-xs ${testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {testResult.ok ? `✓ Test enviado a ${testResult.channel}` : `✗ Error enviando a ${testResult.channel}`}
                </div>
              )}
            </div>
          </Card>

          {/* ── Master Toggle ── */}
          <Card className="!p-5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <h3 className="text-white font-semibold text-sm">Telegram activo</h3>
                <p className="text-gray-500 text-xs">Habilitar o deshabilitar todos los reportes automáticos</p>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={config.telegram_enabled}
                  onChange={(e) => setConfig({ ...config, telegram_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 rounded-full bg-gray-700 peer-checked:bg-[#F46800] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </Card>

          {/* ── Report Types ── */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-wuipi-border">
              <h3 className="text-white font-semibold text-sm">Reportes automáticos</h3>
              <p className="text-gray-500 text-xs">Activar o desactivar cada tipo de reporte</p>
            </div>
            <div className="divide-y divide-wuipi-border/50">
              {REPORT_TYPES.map(({ key, label, desc, icon: Icon, color }) => {
                const enabled = config[key as keyof TelegramConfig] as boolean;
                const disabled = !config.telegram_enabled;
                return (
                  <label key={key} className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-opacity ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
                    <div className={`w-10 h-10 rounded-xl ${color.split(" ")[1]} flex items-center justify-center`}>
                      <Icon size={20} className={color.split(" ")[0]} />
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{label}</p>
                      <p className="text-gray-500 text-xs">{desc}</p>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 rounded-full bg-gray-700 peer-checked:bg-[#F46800] transition-colors" />
                      <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                    </div>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* ── Thresholds ── */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-wuipi-border">
              <h3 className="text-white font-semibold text-sm">Umbrales de alerta</h3>
              <p className="text-gray-500 text-xs">Ajustar sensibilidad de las alertas automáticas</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Cambio mínimo BCV para alertar (%)
                </label>
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={config.bcv_change_pct}
                  onChange={(e) => setConfig({ ...config, bcv_change_pct: parseFloat(e.target.value) || 1 })}
                  className="w-32 px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-wuipi-accent/50 focus:outline-none"
                />
                <p className="text-[10px] text-gray-600 mt-1">Actual: alerta si la tasa cambia más de {config.bcv_change_pct}%</p>
              </div>
              <div className="flex gap-6">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Día inicio alerta borradores
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={config.drafts_alert_day_from}
                    onChange={(e) => setConfig({ ...config, drafts_alert_day_from: parseInt(e.target.value) || 27 })}
                    className="w-24 px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-wuipi-accent/50 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">Se activa a partir del día {config.drafts_alert_day_from} de cada mes</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Borradores mínimos para alertar
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={config.drafts_min_count}
                    onChange={(e) => setConfig({ ...config, drafts_min_count: parseInt(e.target.value) || 50 })}
                    className="w-24 px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-wuipi-accent/50 focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">Alerta si se crean {config.drafts_min_count}+ borradores en un día</p>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Channels Detail ── */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-wuipi-border">
              <h3 className="text-white font-semibold text-sm">Canales y contenido</h3>
              <p className="text-gray-500 text-xs">Qué recibe cada grupo de Telegram</p>
            </div>
            <div className="divide-y divide-wuipi-border/50">
              {Object.entries(CHANNEL_LABELS).map(([key, { label, desc, icon }]) => {
                const active = channels?.[key as keyof ChannelStatus];
                return (
                  <div key={key} className="px-5 py-3 flex items-start gap-3">
                    <span className="text-lg mt-0.5">{icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{label}</p>
                        {active ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">Activo</span>
                        ) : (
                          <span className="text-[10px] text-gray-500 bg-gray-500/10 px-1.5 py-0.5 rounded-full">Sin canal</span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {key === "socios" && (
                          <>
                            <Tag>Briefing diario</Tag><Tag>Alerta BCV</Tag><Tag>Alerta borradores</Tag>
                          </>
                        )}
                        {key === "operaciones" && (
                          <>
                            <Tag>Briefing diario</Tag><Tag>Sin montos $</Tag>
                          </>
                        )}
                        {key === "finanzas" && (
                          <>
                            <Tag>Briefing diario</Tag><Tag>Alerta BCV</Tag><Tag>Alerta borradores</Tag>
                          </>
                        )}
                        {key === "comercial" && (
                          <>
                            <Tag>Briefing diario</Tag><Tag>Alerta BCV</Tag>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Manual Actions ── */}
          <Card className="!p-5">
            <h3 className="text-white font-semibold text-sm mb-3">Acciones manuales</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleManualBriefing}
                disabled={sendingBriefing || !configured}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F46800]/10 border border-[#F46800]/30 text-[#F46800] text-sm font-medium hover:bg-[#F46800]/20 disabled:opacity-40 transition-colors"
              >
                {sendingBriefing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar briefing ahora
              </button>
              <button
                onClick={() => fetchConfig()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white transition-colors"
              >
                <RefreshCw size={14} />
                Recargar estado
              </button>
            </div>
            {briefingResult && (
              <div className={`mt-3 px-3 py-2 rounded text-xs ${briefingResult.sent.length > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                {briefingResult.sent.length > 0
                  ? `✓ Briefing enviado a: ${briefingResult.sent.join(", ")}`
                  : "✗ No se pudo enviar el briefing — verifica que haya un briefing en cache"}
                {briefingResult.failed.length > 0 && briefingResult.failed[0] !== "error" && (
                  <span className="text-red-400"> | Fallidos: {briefingResult.failed.join(", ")}</span>
                )}
              </div>
            )}
          </Card>

          {/* ── Last Briefing Info ── */}
          {lastBriefing && (
            <Card className="!p-5">
              <h3 className="text-white font-semibold text-sm mb-2 flex items-center gap-2">
                <Clock size={14} className="text-gray-500" />
                Último briefing enviado
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-gray-500">Score</p>
                  <p className="text-white font-bold">{lastBriefing.score}/100</p>
                </div>
                <div>
                  <p className="text-gray-500">Motor IA</p>
                  <p className="text-white">{lastBriefing.engine}</p>
                </div>
                <div>
                  <p className="text-gray-500">Enviado a</p>
                  <p className="text-emerald-400">{lastBriefing.sent?.join(", ") || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Fecha</p>
                  <p className="text-white">{new Date(lastBriefing.date).toLocaleString("es-VE", { timeZone: "America/Caracas" })}</p>
                </div>
              </div>
            </Card>
          )}

          {/* ── Save Bar ── */}
          {hasChanges && (
            <div className="sticky bottom-4 flex items-center justify-end gap-2 p-3 rounded-xl bg-wuipi-card border border-wuipi-border shadow-lg">
              <button
                onClick={() => setConfig(original ? { ...original } : config)}
                className="px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] text-gray-400 bg-wuipi-bg px-2 py-0.5 rounded-full border border-wuipi-border/50">
      {children}
    </span>
  );
}
