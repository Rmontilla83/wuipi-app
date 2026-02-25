"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing, StatusBadge, LoadBar } from "@/components/dashboard";
import type { NetworkOverview, NetworkNode, NetworkAlert } from "@/types/prtg";
import {
  Radio, RefreshCw, Activity, ArrowDown, ArrowUp, Clock,
  AlertTriangle, Wifi, Server, Gauge, ChevronDown, ChevronUp,
} from "lucide-react";

function AlertRow({ alert }: { alert: NetworkAlert }) {
  const styles = {
    critical: { bg: "bg-red-500/10", border: "border-red-500/30", icon: "text-red-400" },
    warning: { bg: "bg-amber-500/10", border: "border-amber-500/30", icon: "text-amber-400" },
    info: { bg: "bg-blue-500/10", border: "border-blue-500/30", icon: "text-blue-400" },
  };
  const s = styles[alert.severity];
  return (
    <div className={`p-3 ${s.bg} border ${s.border} rounded-xl flex items-start gap-3`}>
      <AlertTriangle size={16} className={`${s.icon} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-tight">{alert.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{alert.device}</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">{alert.sensor}</span>
        </div>
      </div>
    </div>
  );
}

function NodeCard({ node, expanded, onToggle }: { node: NetworkNode; expanded: boolean; onToggle: () => void }) {
  const capacityPct = node.metrics.bandwidth_in
    ? Math.min(100, Math.round((node.metrics.bandwidth_in / 250) * 100))
    : 0;

  return (
    <div
      className="bg-wuipi-bg border border-wuipi-border rounded-xl overflow-hidden cursor-pointer hover:border-wuipi-accent/30 transition-all"
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Server size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-white">{node.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={node.status as any} />
            {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-xs text-gray-500">Latencia</p>
            <p className={`text-sm font-bold ${(node.metrics.latency || 0) > 100 ? "text-red-400" : (node.metrics.latency || 0) > 50 ? "text-amber-400" : "text-emerald-400"}`}>
              {node.metrics.latency ?? "—"}ms
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Pkt Loss</p>
            <p className={`text-sm font-bold ${(node.metrics.packet_loss || 0) > 2 ? "text-red-400" : (node.metrics.packet_loss || 0) > 0.5 ? "text-amber-400" : "text-emerald-400"}`}>
              {node.metrics.packet_loss ?? "—"}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Uptime</p>
            <p className="text-sm font-bold text-white">{node.metrics.uptime ?? "—"}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Sensores</p>
            <p className="text-sm font-bold text-white">
              <span className="text-emerald-400">{node.sensors.up}</span>
              <span className="text-gray-600">/{node.sensors.total}</span>
            </p>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-wuipi-border space-y-3">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-500">Ancho de banda</span>
              <span className="text-xs text-gray-400">{capacityPct}% capacidad</span>
            </div>
            <LoadBar value={capacityPct} />
            <div className="flex justify-between mt-2">
              <div className="flex items-center gap-1">
                <ArrowDown size={12} className="text-cyan-400" />
                <span className="text-xs text-cyan-400 font-semibold">{node.metrics.bandwidth_in ?? 0} Mbps</span>
              </div>
              <div className="flex items-center gap-1">
                <ArrowUp size={12} className="text-violet-400" />
                <span className="text-xs text-violet-400 font-semibold">{node.metrics.bandwidth_out ?? 0} Mbps</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Up", value: node.sensors.up, color: "text-emerald-400" },
              { label: "Down", value: node.sensors.down, color: "text-red-400" },
              { label: "Warning", value: node.sensors.warning, color: "text-amber-400" },
              { label: "Total", value: node.sensors.total, color: "text-white" },
            ].map((s) => (
              <div key={s.label} className="bg-wuipi-card rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          {(node.metrics.cpu_load !== undefined || node.metrics.memory_usage !== undefined) && (
            <div className="grid grid-cols-2 gap-2">
              {node.metrics.cpu_load !== undefined && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">CPU</span>
                    <span className="text-white font-semibold">{node.metrics.cpu_load}%</span>
                  </div>
                  <LoadBar value={node.metrics.cpu_load} />
                </div>
              )}
              {node.metrics.memory_usage !== undefined && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Memoria</span>
                    <span className="text-white font-semibold">{node.metrics.memory_usage}%</span>
                  </div>
                  <LoadBar value={node.metrics.memory_usage} />
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <span>Grupo: {node.group}</span>
            <span>·</span>
            <span>ID: {node.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InfraestructuraPage() {
  const [data, setData] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [expandedNode, setExpandedNode] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/infraestructura");
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Error fetching infra data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading || !data) {
    return (
      <>
        <TopBar title="Infraestructura" icon={<Radio size={22} />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw size={20} className="animate-spin" />
            <span>Conectando con PRTG...</span>
          </div>
        </div>
      </>
    );
  }

  const criticalAlerts = data.alerts.filter((a) => a.severity === "critical");
  const warningAlerts = data.alerts.filter((a) => a.severity === "warning");

  return (
    <>
      <TopBar title="Infraestructura" icon={<Radio size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-5 gap-4">
          <Card className="flex flex-col items-center justify-center py-4">
            <ScoreRing score={data.health_score} size={80} />
            <p className="text-sm font-semibold text-white mt-2">Salud de Red</p>
            <p className="text-xs text-gray-500">
              {data.health_score >= 90 ? "Excelente" : data.health_score >= 70 ? "Aceptable" : "Crítico"}
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Server size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-white">Dispositivos</span>
            </div>
            <p className="text-3xl font-bold text-white">{data.total_devices}</p>
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-emerald-400">● {data.devices_up} up</span>
              {data.devices_down > 0 && <span className="text-red-400">● {data.devices_down} down</span>}
              {data.devices_warning > 0 && <span className="text-amber-400">● {data.devices_warning} warn</span>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-white">Sensores</span>
            </div>
            <p className="text-3xl font-bold text-white">{data.total_sensors}</p>
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-emerald-400">● {data.sensors_up} up</span>
              {data.sensors_down > 0 && <span className="text-red-400">● {data.sensors_down} down</span>}
              {data.sensors_warning > 0 && <span className="text-amber-400">● {data.sensors_warning} warn</span>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Wifi size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-white">Tráfico Total</span>
            </div>
            <div className="flex items-end gap-1">
              <ArrowDown size={14} className="text-cyan-400" />
              <p className="text-2xl font-bold text-cyan-400">{data.nodes.reduce((a, n) => a + (n.metrics.bandwidth_in || 0), 0)}</p>
              <span className="text-xs text-gray-500 mb-1">Mbps</span>
            </div>
            <div className="flex items-end gap-1 mt-1">
              <ArrowUp size={14} className="text-violet-400" />
              <p className="text-lg font-bold text-violet-400">{data.nodes.reduce((a, n) => a + (n.metrics.bandwidth_out || 0), 0)}</p>
              <span className="text-xs text-gray-500 mb-0.5">Mbps</span>
            </div>
          </Card>

          <Card className="flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500">Última actualización</span>
              </div>
              <p className="text-sm font-semibold text-white">
                {lastRefresh.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
              <p className="text-xs text-gray-500 mt-1">Auto-refresh: 30s</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20
                       rounded-lg text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Actualizando..." : "Refrescar"}
            </button>
          </Card>
        </div>

        {/* Nodes + Alerts */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Server size={18} /> Nodos de Red
                </h3>
                <span className="text-xs text-gray-500">{data.nodes.length} dispositivos</span>
              </div>
              <div className="space-y-3">
                {data.nodes.map((node) => (
                  <NodeCard
                    key={node.id} node={node}
                    expanded={expandedNode === node.id}
                    onToggle={() => setExpandedNode(expandedNode === node.id ? null : node.id)}
                  />
                ))}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            {criticalAlerts.length > 0 && (
              <Card className="border-red-500/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                    <AlertTriangle size={16} /> Críticas
                  </h3>
                  <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full text-xs font-bold">{criticalAlerts.length}</span>
                </div>
                <div className="space-y-2">
                  {criticalAlerts.map((a) => <AlertRow key={a.id} alert={a} />)}
                </div>
              </Card>
            )}

            {warningAlerts.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <AlertTriangle size={16} /> Advertencias
                  </h3>
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full text-xs font-bold">{warningAlerts.length}</span>
                </div>
                <div className="space-y-2">
                  {warningAlerts.map((a) => <AlertRow key={a.id} alert={a} />)}
                </div>
              </Card>
            )}

            <Card>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Gauge size={16} /> Resumen por Zona
              </h3>
              <div className="space-y-3">
                {Object.entries(
                  data.nodes.reduce<Record<string, { total: number; up: number; down: number; warning: number }>>((acc, node) => {
                    const g = node.group || "Sin grupo";
                    if (!acc[g]) acc[g] = { total: 0, up: 0, down: 0, warning: 0 };
                    acc[g].total++;
                    if (node.status === "online") acc[g].up++;
                    else if (node.status === "critical" || node.status === "offline") acc[g].down++;
                    else acc[g].warning++;
                    return acc;
                  }, {})
                ).map(([zone, c]) => (
                  <div key={zone} className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-white">{zone}</span>
                      <span className="text-xs text-gray-500">{c.total} nodos</span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-400">● {c.up} ok</span>
                      {c.warning > 0 && <span className="text-amber-400">● {c.warning} warn</span>}
                      {c.down > 0 && <span className="text-red-400">● {c.down} down</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 glow-dot" />
                <span className="text-xs font-semibold text-gray-400">Modo Demo</span>
              </div>
              <p className="text-[11px] text-gray-600">
                Datos de demostración. Configura las variables PRTG en Vercel para conectar tu servidor.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
