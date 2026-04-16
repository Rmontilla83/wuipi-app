"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/layout/topbar";
import { BequantSubNav } from "@/components/bequant/sub-nav";
import {
  ArrowLeft, RefreshCw, Activity, Clock, Wifi, TrendingDown,
  User, Radio, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, Cell,
} from "recharts";
import type { BequantSubscriberDetail } from "@/types/bequant";
import { MonthlyDpiHistory } from "@/components/bequant/monthly-dpi-history";

const DPI_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
];

function lastValid(arr?: number[]): number | null {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== -1) return arr[i];
  }
  return null;
}

function tsToSeries(ts: { timestamp: number[]; dataDownlink?: number[]; dataUplink?: number[] } | null) {
  if (!ts?.timestamp) return [];
  return ts.timestamp.map((t, i) => ({
    time: new Date(t * 1000).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" }),
    downlink: ts.dataDownlink?.[i] === -1 ? null : ts.dataDownlink?.[i],
    uplink: ts.dataUplink?.[i] === -1 ? null : ts.dataUplink?.[i],
  }));
}

function dpiToBars(
  series: { categories: Array<{ name: string; usage: number[] }> } | null,
  top = 10
) {
  if (!series?.categories) return [];
  return series.categories
    .map(c => ({
      name: c.name,
      bytes: (c.usage || []).filter(v => v !== -1).reduce((a, b) => a + b, 0),
    }))
    .filter(c => c.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, top);
}

function formatBytes(kb: number | null | undefined): string {
  if (kb == null) return "—";
  const units = ["KB", "MB", "GB", "TB"];
  let v = kb;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

export default function BequantSubscriberDetailPage() {
  const params = useParams<{ ip: string }>();
  const ip = decodeURIComponent(params.ip);

  const [data, setData] = useState<BequantSubscriberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bequant/subscribers/${encodeURIComponent(ip)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ip]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-wuipi-bg">
        <TopBar title="Detalle QoE" subtitle={ip} />
        <div className="p-6 flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-wuipi-accent animate-spin" />
        </div>
      </div>
    );
  }

  const bandwidthAvg = lastValid(data?.bandwidth?.dataDownlink);
  const latencyNow = lastValid(data?.latency?.dataDownlink);
  const retxNow = lastValid(data?.retransmission?.dataDownlink);
  const congNow = lastValid(data?.congestion?.dataDownlink);

  return (
    <div className="min-h-screen bg-wuipi-bg">
      <TopBar
        title={`QoE — ${ip}`}
        subtitle={data?.odoo?.partnerName || "Cliente no vinculado con Odoo"}
        actions={
          <div className="flex gap-2">
            <Link
              href="/bequant/suscriptores"
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wuipi-card border border-wuipi-border rounded-lg hover:border-wuipi-accent"
            >
              <ArrowLeft size={14} />
              Volver
            </Link>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wuipi-card border border-wuipi-border rounded-lg hover:border-wuipi-accent disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
              Refrescar
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        <BequantSubNav />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error}</span>
          </div>
        )}

        {/* Info card: BQN + Odoo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3 flex items-center gap-2">
              <Radio size={16} /> Datos en Bequant
            </h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between">
                <dt className="text-gray-500">IP</dt>
                <dd className="font-mono text-white">{data?.info.subscriberIp}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Policy</dt>
                <dd>{data?.info.policyRate ? (
                  <span className="px-2 py-0.5 rounded bg-wuipi-accent/10 text-wuipi-accent text-xs">
                    {data.info.policyRate}
                  </span>
                ) : <span className="text-gray-400">default</span>}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Asignado por</dt>
                <dd className="text-gray-300">{data?.info.policyAssignedBy || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Grupos</dt>
                <dd className="text-gray-300 text-xs text-right">
                  {(data?.info.subscriberGroups || []).join(", ") || "—"}
                </dd>
              </div>
            </dl>
          </div>

          {data?.odoo && data.odoo.partnerId ? (
            <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
              <h3 className="text-sm text-gray-500 mb-3 flex items-center gap-2">
                <User size={16} /> Cliente vinculado (Odoo)
              </h3>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cliente</dt>
                  <dd className="text-white">{data.odoo.partnerName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Plan</dt>
                  <dd className="text-gray-300">{data.odoo.productName || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Nodo</dt>
                  <dd className="text-gray-300">{data.odoo.nodeName || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Estado</dt>
                  <dd>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-xs",
                      data.odoo.serviceState === "progress" && "bg-green-500/10 text-green-400",
                      data.odoo.serviceState === "suspended" && "bg-yellow-500/10 text-yellow-400",
                      data.odoo.serviceState === "draft" && "bg-gray-500/10 text-gray-400",
                    )}>{data.odoo.serviceState || "—"}</span>
                  </dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-gray-500">IP CPE</dt>
                  <dd className="font-mono text-gray-400">{data.odoo.ipCpe || "—"}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-gray-500">IPv4</dt>
                  <dd className="font-mono text-gray-400">{data.odoo.ipv4 || "—"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5 flex items-center justify-center">
              <div className="text-center">
                <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-sm text-gray-400">IP no vinculada a servicio en Odoo</div>
                <div className="text-xs text-gray-500 mt-1">Posible device de cliente (cámara, TV, móvil)</div>
              </div>
            </div>
          )}
        </div>

        {/* KPIs en tiempo real */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Wifi size={12} /> Ancho banda (DL)
            </div>
            <div className="text-xl font-bold text-white">
              {bandwidthAvg != null ? `${(bandwidthAvg / 1000).toFixed(2)} Mbps` : "—"}
            </div>
          </div>
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Clock size={12} /> Latencia
            </div>
            <div className="text-xl font-bold text-white">
              {latencyNow != null ? `${latencyNow.toFixed(1)} ms` : "—"}
            </div>
          </div>
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <TrendingDown size={12} /> Retransmisión
            </div>
            <div className="text-xl font-bold text-white">
              {retxNow != null ? `${retxNow.toFixed(2)}%` : "—"}
            </div>
          </div>
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Activity size={12} /> Congestión
            </div>
            <div className="text-xl font-bold text-white">
              {congNow != null ? `${congNow.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Time-series charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Ancho de banda (kbps)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tsToSeries(data?.bandwidth ?? null)}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} />
                <Legend />
                <Line type="monotone" dataKey="downlink" stroke="#3b82f6" name="DL" dot={false} />
                <Line type="monotone" dataKey="uplink" stroke="#10b981" name="UL" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Latencia (ms)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tsToSeries(data?.latency ?? null)}>
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

          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Retransmisión (%)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tsToSeries(data?.retransmission ?? null)}>
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
            <h3 className="text-sm text-gray-500 mb-3">Congestión (%)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tsToSeries(data?.congestion ?? null)}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} />
                <Line type="monotone" dataKey="downlink" stroke="#f59e0b" name="DL" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* DPI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Top apps — Descarga</h3>
            {dpiToBars(data?.dpiDownlink ?? null).length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-xs text-gray-500">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={dpiToBars(data?.dpiDownlink ?? null)}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#6b7280" fontSize={11}
                    tickFormatter={v => formatBytes(v).replace(" ", "")} />
                  <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={11} width={100} />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }}
                    formatter={(v: number) => formatBytes(v)}
                  />
                  <Bar dataKey="bytes">
                    {dpiToBars(data?.dpiDownlink ?? null).map((_, i) => (
                      <Cell key={i} fill={DPI_COLORS[i % DPI_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
            <h3 className="text-sm text-gray-500 mb-3">Top apps — Subida</h3>
            {dpiToBars(data?.dpiUplink ?? null).length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-xs text-gray-500">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart layout="vertical" data={dpiToBars(data?.dpiUplink ?? null)}>
                  <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#6b7280" fontSize={11}
                    tickFormatter={v => formatBytes(v).replace(" ", "")} />
                  <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={11} width={100} />
                  <Tooltip
                    contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }}
                    formatter={(v: number) => formatBytes(v)}
                  />
                  <Bar dataKey="bytes">
                    {dpiToBars(data?.dpiUplink ?? null).map((_, i) => (
                      <Cell key={i} fill={DPI_COLORS[i % DPI_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <MonthlyDpiHistory ip={ip} />

        <div className="text-xs text-gray-500 flex items-center gap-2">
          <CheckCircle2 size={12} className="text-green-400" />
          DPI en vivo no se persiste. El histórico mensual agrega solo top 10 apps (política de privacidad).
        </div>
      </div>
    </div>
  );
}
