"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Gauge, Download, Upload, Zap, RefreshCw, AlertTriangle, CheckCircle2,
  Info, ChevronDown, ChevronUp, Headphones, Wifi, Clock,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Link from "next/link";

type ScoreLevel = "excellent" | "good" | "fair" | "poor";

interface ServiceData {
  name: string;
  plan_name: string;
  plan_mbps: number | null;
  state: string;
  available: boolean;
  reason?: string;
  score?: number;
  score_level?: ScoreLevel;
  current?: {
    download_mbps: number;
    upload_mbps: number;
    latency_ms: number | null;
  };
  issues?: string[];
  history_24h?: Array<{ time: string; download_mbps: number | null }>;
  last_updated?: string;
}

const SCORE_META: Record<ScoreLevel, { label: string; color: string; bg: string; emoji: string; desc: string }> = {
  excellent: {
    label: "Excelente",
    color: "text-emerald-400",
    bg: "from-emerald-500/20 to-emerald-500/5 border-emerald-400/30",
    emoji: "✨",
    desc: "Tu internet está funcionando muy bien.",
  },
  good: {
    label: "Bueno",
    color: "text-blue-400",
    bg: "from-blue-500/20 to-blue-500/5 border-blue-400/30",
    emoji: "👍",
    desc: "Tu conexión funciona correctamente para uso diario.",
  },
  fair: {
    label: "Regular",
    color: "text-amber-400",
    bg: "from-amber-500/20 to-amber-500/5 border-amber-400/30",
    emoji: "⚠️",
    desc: "Notamos algo de degradación. Podés notar lentitud puntual.",
  },
  poor: {
    label: "Necesita atención",
    color: "text-red-400",
    bg: "from-red-500/20 to-red-500/5 border-red-400/30",
    emoji: "🔧",
    desc: "Detectamos problemas. Recomendamos reportar un ticket.",
  },
};

function latencyLabel(ms: number | null): { label: string; color: string } {
  if (ms == null) return { label: "sin datos", color: "text-gray-500" };
  if (ms < 25) return { label: "Excelente para videollamadas y juegos", color: "text-emerald-400" };
  if (ms < 60) return { label: "Muy bueno para uso diario", color: "text-blue-400" };
  if (ms < 100) return { label: "Aceptable, puede notarse en juegos", color: "text-amber-400" };
  return { label: "Alto, puede afectar videollamadas", color: "text-red-400" };
}

function SpeedMeter({ value, plan, icon: Icon, label }: {
  value: number; plan: number | null; icon: typeof Download; label: string;
}) {
  const pct = plan ? Math.min(100, (value / plan) * 100) : 0;
  const color = pct > 85 ? "bg-emerald-500" : pct > 60 ? "bg-blue-500" : pct > 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-2xl font-bold text-white">{value.toFixed(1)}</span>
        <span className="text-xs text-gray-400">Mbps</span>
        {plan && (
          <span className="text-[10px] text-gray-500 ml-auto">
            de {plan} contratados
          </span>
        )}
      </div>
      {plan && (
        <div className="h-1.5 bg-wuipi-bg rounded-full overflow-hidden">
          <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function IssueBanner({ issues }: { issues: string[] }) {
  const msgs: Record<string, string> = {
    slow_speed: "Tu velocidad está por debajo de lo contratado",
    high_latency: "Detectamos tiempos de respuesta altos",
    unstable: "Estamos viendo inestabilidad en tu conexión",
  };
  return (
    <Card className="!bg-amber-500/5 border-amber-400/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-400 mb-1">Detectamos algo raro</p>
          <ul className="text-xs text-gray-300 space-y-0.5">
            {issues.map(k => <li key={k}>• {msgs[k] || k}</li>)}
          </ul>
          <Link
            href="/portal/ayuda"
            className="inline-flex items-center gap-1 mt-3 text-xs px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium"
          >
            <Headphones size={12} /> Reportar incidencia
          </Link>
        </div>
      </div>
    </Card>
  );
}

function FAQ({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card>
      <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Info size={14} className="text-wuipi-accent" />
        Dudas frecuentes
      </p>
      <div className="space-y-1">
        {items.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="border-t border-wuipi-border/30 first:border-t-0">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full py-3 flex items-center justify-between text-left"
              >
                <span className="text-sm text-gray-200">{it.q}</span>
                {isOpen ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
              </button>
              {isOpen && <p className="text-xs text-gray-400 pb-3 leading-relaxed">{it.a}</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const FAQS = [
  {
    q: "¿Qué significa Mbps?",
    a: "Mbps significa 'Megabits por segundo'. Es la unidad de medida de velocidad de internet. Si tu plan es de 100 Mbps, en condiciones ideales puedes descargar hasta 100 megabits en un segundo. 1 Mbps es aproximadamente 0.125 MB/s.",
  },
  {
    q: "¿Por qué mi velocidad real es menor que la contratada?",
    a: "Muchas cosas pueden afectarla: el WiFi (las paredes, distancia del router), cuántos dispositivos están conectados al mismo tiempo, la hora del día (más tráfico en horas pico), y el servidor con el que te estás conectando. Lo normal es recibir entre el 70% y 100% de lo contratado en conexión por cable.",
  },
  {
    q: "¿Qué es la latencia?",
    a: "Es el tiempo que tarda un dato en ir desde tu dispositivo a internet y volver, medido en milisegundos (ms). Mientras más baja, mejor. Para videollamadas, Zoom o juegos online lo ideal es menos de 30 ms.",
  },
  {
    q: "¿Qué hago si mi calidad aparece 'Regular' o 'Necesita atención'?",
    a: "Primero, probá reiniciar tu router y el equipo de Wuipi (desenchúfalos 30 segundos y vuélvelos a conectar). Si después de 10 minutos sigue igual, podés reportarlo desde la sección Soporte y un técnico revisará tu línea.",
  },
  {
    q: "¿Estos datos son en tiempo real?",
    a: "Sí, se miden directamente en nuestra red cada 5 minutos. El botón 'Actualizar' trae la medición más reciente.",
  },
];

export default function MyConnectionView() {
  const [data, setData] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/bequant/my-connection", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No pudimos cargar tus datos");
      setData(json.services || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={24} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-10">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
        <p className="text-sm text-gray-300 mb-1">No pudimos cargar tu información</p>
        <p className="text-xs text-gray-500 mb-4">{error}</p>
        <button onClick={() => fetchData(true)}
          className="text-sm px-4 py-2 rounded bg-wuipi-accent/10 text-wuipi-accent hover:bg-wuipi-accent/20">
          Intentar de nuevo
        </button>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="text-center py-10">
        <Wifi size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-sm text-gray-300">Aún no tenés servicios activos registrados</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mi Conexión</h1>
          <p className="text-sm text-gray-500">Cómo está funcionando tu internet en este momento</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-wuipi-card border border-wuipi-border rounded-lg hover:border-wuipi-accent disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {data.map((svc, idx) => {
        if (!svc.available) {
          return (
            <Card key={idx}>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{svc.plan_name}</p>
                  <p className="text-xs text-gray-500">{svc.reason}</p>
                </div>
              </div>
            </Card>
          );
        }

        const meta = SCORE_META[svc.score_level || "good"];
        const lat = latencyLabel(svc.current?.latency_ms ?? null);

        return (
          <div key={idx} className="space-y-4">
            {/* Score hero */}
            <Card className={`!bg-gradient-to-br ${meta.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">{svc.plan_name}</p>
                  <h2 className="text-lg font-semibold text-white">Calidad de tu conexión</h2>
                </div>
                <div className="text-3xl">{meta.emoji}</div>
              </div>
              <div className="flex items-end gap-3 mb-2">
                <span className={`text-5xl font-bold ${meta.color}`}>{svc.score}</span>
                <span className={`text-lg font-semibold ${meta.color} pb-2`}>/ 100</span>
                <span className={`${meta.color} text-xl font-bold pb-1 ml-auto`}>{meta.label}</span>
              </div>
              <p className="text-xs text-gray-300">{meta.desc}</p>
              <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
                <Info size={10} className="inline mr-1" />
                Este puntaje combina velocidad real, tiempo de respuesta (latencia) y estabilidad de tu conexión. Se actualiza al refrescar.
              </p>
            </Card>

            {/* Issue banner if any */}
            {svc.issues && svc.issues.length > 0 && (
              <IssueBanner issues={svc.issues} />
            )}

            {/* Speed */}
            <Card>
              <p className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                <Gauge size={16} className="text-wuipi-accent" />
                Velocidad actual
              </p>
              <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                Así está bajando y subiendo datos tu conexión ahora mismo. Esta velocidad es medida por cable en nuestra red, antes de que llegue a tu WiFi.
              </p>
              <div className="grid grid-cols-2 gap-5">
                <SpeedMeter value={svc.current!.download_mbps} plan={svc.plan_mbps} icon={Download} label="Descarga" />
                <SpeedMeter value={svc.current!.upload_mbps} plan={svc.plan_mbps} icon={Upload} label="Subida" />
              </div>
            </Card>

            {/* Latency */}
            <Card>
              <p className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                <Zap size={16} className="text-wuipi-accent" />
                Tiempo de respuesta (latencia)
              </p>
              <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                Es el tiempo que tarda un dato en ir y volver. Mientras menor el número, mejor. Importante para videollamadas, Zoom, Teams y juegos online.
              </p>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-white">
                  {svc.current?.latency_ms != null ? svc.current.latency_ms.toFixed(0) : "—"}
                </span>
                <span className="text-sm text-gray-400">ms</span>
              </div>
              <p className={`text-xs ${lat.color} flex items-center gap-1`}>
                <CheckCircle2 size={12} /> {lat.label}
              </p>
            </Card>

            {/* 24h chart */}
            {svc.history_24h && svc.history_24h.length > 0 && (
              <Card>
                <p className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <Clock size={16} className="text-wuipi-accent" />
                  Últimas 24 horas
                </p>
                <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
                  Tu velocidad de descarga hora por hora. Los valles suelen coincidir con horas de menor uso (madrugada); los picos, con mayor uso.
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={svc.history_24h}>
                    <defs>
                      <linearGradient id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#6b7280" fontSize={10}
                      tickFormatter={(v, i) => i % 3 === 0 ? v : ""} />
                    <YAxis stroke="#6b7280" fontSize={10}
                      tickFormatter={v => `${v} Mbps`} />
                    <Tooltip
                      contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }}
                      formatter={(v: number) => [`${v} Mbps`, "Descarga"]}
                    />
                    <Area type="monotone" dataKey="download_mbps" stroke="#3b82f6" fill={`url(#grad-${idx})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}

            {svc.last_updated && (
              <p className="text-[10px] text-gray-600 text-center">
                Última medición: {new Date(svc.last_updated).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        );
      })}

      <FAQ items={FAQS} />

      <Card className="!bg-wuipi-accent/5 border-wuipi-accent/30">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-wuipi-accent shrink-0 mt-0.5" />
          <div className="text-xs text-gray-300 leading-relaxed">
            <strong className="text-white">¿Necesitás ayuda?</strong> Si tu calidad está en &quot;Regular&quot; o &quot;Necesita atención&quot; por más de una hora,
            probá reiniciando el equipo de Wuipi. Si sigue igual,{" "}
            <Link href="/portal/ayuda" className="text-wuipi-accent hover:underline">
              reportá un ticket de soporte
            </Link>
            {" "}y un técnico revisará tu línea.
          </div>
        </div>
      </Card>
    </div>
  );
}
