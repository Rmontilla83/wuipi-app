"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { BequantSubNav } from "@/components/bequant/sub-nav";
import {
  Radio, RefreshCw, Activity, Wifi, Clock, Layers, AlertTriangle,
  TrendingDown, TrendingUp, ShieldCheck, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, Cell,
} from "recharts";
import type { BequantNodeSnapshotRow, BequantSubscriberGroupRow, BequantTimeSeries } from "@/types/bequant";

interface NodeResponse {
  live: {
    volume: BequantTimeSeries | null;
    latency: BequantTimeSeries | null;
    congestion: BequantTimeSeries | null;
    retransmission: BequantTimeSeries | null;
    flows: (BequantTimeSeries & { flowsActive?: number[]; flowsCreated?: number[] }) | null;
    trafficAtMaxSpeed: BequantTimeSeries | null;
  };
  kpis: {
    volumeDl: number | null;
    volumeUl: number | null;
    latencyDl: number | null;
    latencyUl: number | null;
    congestion: number | null;
    retransmissionDl: number | null;
    retransmissionUl: number | null;
    flowsActive: number | null;
    flowsCreated: number | null;
    trafficAtMaxSpeed: number | null;
  };
  dpi: {
    downlinkTop: Array<{ name: string; bytes: number }>;
    uplinkTop: Array<{ name: string; bytes: number }>;
  };
  groups: BequantSubscriberGroupRow[];
  lastSnapshot: BequantNodeSnapshotRow | null;
  trend24h: BequantNodeSnapshotRow[];
  circuit: { open: boolean; failures: number; opensFor: number };
}

const DPI_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
];

function formatBytes(kb: number | null | undefined): string {
  if (kb == null) return "—";
  const units = ["KB", "MB", "GB", "TB"];
  let v = kb;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

function tsToSeries(ts: BequantTimeSeries | null) {
  if (!ts?.timestamp) return [];
  return ts.timestamp.map((t, i) => ({
    time: new Date(t * 1000).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
    downlink: ts.dataDownlink?.[i] === -1 ? null : ts.dataDownlink?.[i],
    uplink: ts.dataUplink?.[i] === -1 ? null : ts.dataUplink?.[i],
  }));
}

function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Activity; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color || "bg-wuipi-accent/10")}>
          <Icon size={20} className={color ? "text-white" : "text-wuipi-accent"} />
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function BequantDashboard() {
  const [data, setData] = useState<NodeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bequant/node", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error consultando Bequant");
      setData(json);
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
      <>
        <TopBar title="Bequant QoE" subtitle="Cargando…" />
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-wuipi-accent animate-spin" />
        </div>
      </>
    );
  }

  const bandwidthSeries = tsToSeries(data?.live.volume || null);
  const latencySeries = tsToSeries(data?.live.latency || null);
  const retxSeries = tsToSeries(data?.live.retransmission || null);
  const trendData = (data?.trend24h || []).map(s => ({
    time: new Date(s.taken_at).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
    latency: s.latency_dl,
    retx: s.retransmission_dl,
    congestion: s.congestion,
  }));

  return (
    <>
      <TopBar
        title="Bequant QoE"
        subtitle="Monitor del nodo y experiencia de usuario"
        actions={
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wuipi-card border border-wuipi-border rounded-lg hover:border-wuipi-accent disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            Refrescar
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <BequantSubNav />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <div className="text-red-400 font-medium">Error</div>
              <div className="text-sm text-gray-400">{error}</div>
            </div>
          </div>
        )}

        {/* Show banner only when ALL live KPIs are null — means BQN truly unreachable */}
        {data &&
          data.kpis.volumeDl == null &&
          data.kpis.latencyDl == null &&
          data.kpis.congestion == null && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <div className="flex-1">
              <div className="text-yellow-400 font-medium">Sin datos en vivo del nodo</div>
              <div className="text-xs text-gray-400">
                Bequant no respondió en este refresh. Los datos históricos de abajo siguen siendo válidos. Probá refrescar en unos segundos.
              </div>
            </div>
          </div>
        )}

        {/* KPIs del nodo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard icon={Wifi} label="Volumen DL" value={formatBytes(data?.kpis.volumeDl)} sub="Tráfico bajada" />
          <KPICard icon={TrendingUp} label="Volumen UL" value={formatBytes(data?.kpis.volumeUl)} sub="Tráfico subida" />
          <KPICard icon={Clock} label="Latencia" value={data?.kpis.latencyDl != null ? `${data.kpis.latencyDl.toFixed(1)} ms` : "—"} sub="Hacia cliente" />
          <KPICard icon={TrendingDown} label="Retransmisión" value={data?.kpis.retransmissionDl != null ? `${data.kpis.retransmissionDl.toFixed(2)}%` : "—"} sub="TCP DL" />
          <KPICard icon={Activity} label="Congestión" value={data?.kpis.congestion != null ? `${data.kpis.congestion.toFixed(1)}%` : "—"} />
          <KPICard icon={Layers} label="Flujos activos" value={data?.kpis.flowsActive?.toLocaleString("es-VE") || "—"} />
          <KPICard icon={Cpu} label="Flujos creados" value={data?.kpis.flowsCreated?.toLocaleString("es-VE") || "—"} />
          <KPICard icon={ShieldCheck} label="A vel. máxima" value={data?.kpis.trafficAtMaxSpeed != null ? `${data.kpis.trafficAtMaxSpeed.toFixed(1)}%` : "—"} />
        </div>

        {/* Tráfico en vivo + Latencia en vivo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3 flex items-center gap-2">
              <Wifi size={16} /> Ancho de banda — última hora
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={bandwidthSeries}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} />
                <Legend />
                <Line type="monotone" dataKey="downlink" stroke="#3b82f6" name="DL (kbps)" dot={false} />
                <Line type="monotone" dataKey="uplink" stroke="#10b981" name="UL (kbps)" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3 flex items-center gap-2">
              <Clock size={16} /> Latencia — última hora (ms)
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={latencySeries}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} />
                <Legend />
                <Line type="monotone" dataKey="downlink" stroke="#8b5cf6" name="DL" dot={false} />
                <Line type="monotone" dataKey="uplink" stroke="#f59e0b" name="UL" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Retransmisión + Tendencia 24h */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Retransmisión TCP (%)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={retxSeries}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} />
                <Legend />
                <Line type="monotone" dataKey="downlink" stroke="#ef4444" name="DL" dot={false} />
                <Line type="monotone" dataKey="uplink" stroke="#ec4899" name="UL" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Tendencia 24 h (snapshots)</h3>
            {trendData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">
                Aún no hay snapshots. El cron corre cada hora.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                  <YAxis stroke="#6b7280" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} />
                  <Legend />
                  <Line type="monotone" dataKey="latency" stroke="#8b5cf6" name="Latencia ms" dot={false} />
                  <Line type="monotone" dataKey="retx" stroke="#ef4444" name="Retx %" dot={false} />
                  <Line type="monotone" dataKey="congestion" stroke="#f59e0b" name="Cong %" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* DPI top + Grupos AVI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3 flex items-center gap-2">
              <Radio size={16} /> Top 10 aplicaciones (DL)
            </h3>
            {(data?.dpi.downlinkTop || []).length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-gray-500 text-sm">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart layout="vertical" data={data!.dpi.downlinkTop.map((d, i) => ({ ...d, color: DPI_COLORS[i] }))}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#6b7280" fontSize={11}
                    tickFormatter={v => formatBytes(v).replace(" ", "")} />
                  <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={11} width={100} />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }}
                    formatter={(v: number) => formatBytes(v)}
                  />
                  <Bar dataKey="bytes">
                    {data!.dpi.downlinkTop.map((_, i) => (
                      <Cell key={i} fill={DPI_COLORS[i % DPI_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Clientes por torre (AVI)</h3>
            <div className="space-y-2">
              {(data?.groups || [])
                .filter(g => g.group_type !== "all-subscribers")
                .map(g => (
                  <div key={g.name} className="flex items-center justify-between p-3 rounded-lg bg-wuipi-bg border border-wuipi-border">
                    <div>
                      <div className="text-sm font-medium text-white">{g.name}</div>
                      <div className="text-xs text-gray-500">{g.ranges.length} rangos IP</div>
                    </div>
                    <div className="text-xl font-bold text-wuipi-accent">
                      {g.client_count.toLocaleString("es-VE")}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {data?.lastSnapshot && (
          <div className="text-xs text-gray-500 text-right">
            Último snapshot: {new Date(data.lastSnapshot.taken_at).toLocaleString("es-VE")}
          </div>
        )}
      </div>
    </>
  );
}
