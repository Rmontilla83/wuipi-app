"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { NetworkOverviewPanel } from "@/components/infraestructura/network-overview-panel";
import { HostGrid } from "@/components/infraestructura/host-grid";
import { ProblemsList } from "@/components/infraestructura/problems-list";
import { LatencyCharts } from "@/components/infraestructura/latency-charts";
import { APClientsList } from "@/components/infraestructura/ap-clients-list";
import { OutageTimeline } from "@/components/infraestructura/outage-timeline";
import type { InfraOverview, InfraHost, InfraProblem, HostLatency, APClient, OutageEvent } from "@/types/zabbix";
import {
  Radio, RefreshCw, LayoutGrid, Server, AlertTriangle,
  Clock, Wifi, History,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
type Tab = "resumen" | "equipos" | "problemas" | "latencia" | "clientes-ap" | "historial";

interface InfraData {
  overview: InfraOverview | null;
  hosts: InfraHost[];
  problems: InfraProblem[];
  latencies: HostLatency[];
  apClients: APClient[];
  outages: OutageEvent[];
}

const TABS: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { key: "resumen", label: "Resumen", icon: LayoutGrid },
  { key: "equipos", label: "Equipos", icon: Server },
  { key: "problemas", label: "Problemas", icon: AlertTriangle },
  { key: "latencia", label: "Latencia", icon: Clock },
  { key: "clientes-ap", label: "Clientes AP", icon: Wifi },
  { key: "historial", label: "Historial", icon: History },
];

// ============================================
// MAIN PAGE
// ============================================
export default function InfraestructuraPage() {
  const [tab, setTab] = useState<Tab>("resumen");
  const [data, setData] = useState<InfraData>({
    overview: null, hosts: [], problems: [], latencies: [], apClients: [], outages: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [outagePeriod, setOutagePeriod] = useState("24h");

  const fetchAll = useCallback(async () => {
    try {
      const [overview, hosts, problems, latencies, apClients, outages] = await Promise.all([
        fetch("/api/infraestructura").then((r) => r.json()),
        fetch("/api/infraestructura/hosts").then((r) => r.json()),
        fetch("/api/infraestructura/problems").then((r) => r.json()),
        fetch("/api/infraestructura/latency?period=24h").then((r) => r.json()),
        fetch("/api/infraestructura/clients").then((r) => r.json()),
        fetch(`/api/infraestructura/history?period=${outagePeriod}`).then((r) => r.json()),
      ]);

      setData({ overview, hosts, problems, latencies, apClients, outages });
    } catch (err) {
      console.error("Error fetching infra data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [outagePeriod]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Refetch outages when period changes
  useEffect(() => {
    fetch(`/api/infraestructura/history?period=${outagePeriod}`)
      .then((r) => r.json())
      .then((outages) => setData((prev) => ({ ...prev, outages })))
      .catch(console.error);
  }, [outagePeriod]);

  return (
    <>
      <TopBar title="Infraestructura" icon={<Radio size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  tab === t.key
                    ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20"
                    : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
                }`}
              >
                <Icon size={16} />
                {t.label}
                {t.key === "problemas" && data.problems.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400">
                    {data.problems.length}
                  </span>
                )}
              </button>
            );
          })}

          {/* Refresh button */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-gray-600">Auto-refresh: 60s</span>
            <button
              onClick={() => { setRefreshing(true); fetchAll(); }}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-wuipi-accent/10 border border-wuipi-accent/20 rounded-lg text-wuipi-accent text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              Refrescar
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw size={20} className="animate-spin" />
              <span>Conectando con Zabbix...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Resumen tab */}
            {tab === "resumen" && (
              <div className="space-y-6">
                <NetworkOverviewPanel data={data.overview} />

                <div className="grid grid-cols-2 gap-4">
                  {/* Mini problems */}
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <AlertTriangle size={16} /> Problemas Activos
                      </h3>
                      <button onClick={() => setTab("problemas")} className="text-xs text-wuipi-accent hover:underline">
                        Ver todos
                      </button>
                    </div>
                    <div className="space-y-2">
                      {data.problems.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full ${
                            p.severity === "disaster" || p.severity === "high" ? "bg-red-500" :
                            p.severity === "average" ? "bg-amber-500" : "bg-yellow-500"
                          }`} />
                          <span className="text-white truncate flex-1">{p.name}</span>
                          <span className="text-gray-500 shrink-0">{p.hostName}</span>
                        </div>
                      ))}
                      {data.problems.length === 0 && (
                        <p className="text-xs text-emerald-400 text-center py-2">Sin problemas</p>
                      )}
                    </div>
                  </Card>

                  {/* Mini host status */}
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Server size={16} /> Estado de Equipos
                      </h3>
                      <button onClick={() => setTab("equipos")} className="text-xs text-wuipi-accent hover:underline">
                        Ver todos
                      </button>
                    </div>
                    <div className="space-y-2">
                      {data.hosts.filter((h) => h.status === "offline").map((h) => (
                        <div key={h.id} className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-red-400 font-medium">{h.name}</span>
                          <span className="text-gray-600 truncate">{h.error}</span>
                        </div>
                      ))}
                      {data.hosts.filter((h) => h.status === "offline").length === 0 && (
                        <p className="text-xs text-emerald-400 text-center py-2">Todos los equipos en línea</p>
                      )}
                      <div className="pt-2 border-t border-wuipi-border/50 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-bold text-emerald-400">{data.hosts.filter((h) => h.status === "online").length}</p>
                          <p className="text-[10px] text-gray-500">Online</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-red-400">{data.hosts.filter((h) => h.status === "offline").length}</p>
                          <p className="text-[10px] text-gray-500">Offline</p>
                        </div>
                        <div>
                          <p className="text-lg font-bold text-gray-400">{data.hosts.filter((h) => h.status === "unknown").length}</p>
                          <p className="text-[10px] text-gray-500">Desconocido</p>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Mini AP clients */}
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Wifi size={16} /> Clientes Wireless
                    </h3>
                    <button onClick={() => setTab("clientes-ap")} className="text-xs text-wuipi-accent hover:underline">
                      Ver detalle
                    </button>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-2xl font-bold text-white">
                        {data.apClients.reduce((s, a) => s + a.clients, 0)}
                      </p>
                      <p className="text-xs text-gray-500">clientes conectados</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2 overflow-hidden">
                      {data.apClients.slice(0, 5).map((ap) => (
                        <div key={ap.hostId} className="px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded text-[10px] text-violet-400 shrink-0">
                          {ap.hostName.replace(/^AP-/, "")}: <span className="font-bold">{ap.clients}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Full-size tab views */}
            {tab === "equipos" && <HostGrid hosts={data.hosts} />}
            {tab === "problemas" && <ProblemsList problems={data.problems} />}
            {tab === "latencia" && <LatencyCharts latencies={data.latencies} />}
            {tab === "clientes-ap" && <APClientsList clients={data.apClients} />}
            {tab === "historial" && (
              <OutageTimeline events={data.outages} period={outagePeriod} onPeriodChange={setOutagePeriod} />
            )}
          </>
        )}
      </div>
    </>
  );
}
