"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  ZabbixBanner, AlertBanner, KPIRow, MapaSitios,
  ProblemasActivos, PeoresRed, DetalleEquipos,
} from "@/components/comando/infra";
import type { InfraOverview, InfraProblem, InfraHost } from "@/types/zabbix";
import {
  Radio, Search, Server, Wifi, Activity, ChevronRight,
  ArrowLeft, Loader2, AlertTriangle, ExternalLink, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { MikrotikNode, MikrotikService } from "@/types/odoo";

// ── Subtab type ──────────────────────────────────────────

type SubTab = "monitoreo" | "gestion";

// ── State badge ──────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    progress: { label: "Activo", cls: "text-emerald-400 bg-emerald-400/10" },
    suspended: { label: "Suspendido", cls: "text-red-400 bg-red-400/10" },
    closed: { label: "Cerrado", cls: "text-gray-400 bg-gray-400/10" },
  };
  const s = map[state] || { label: state, cls: "text-gray-400 bg-gray-400/10" };
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", s.cls)}>{s.label}</span>;
}

// ── Main page ──────────────────────────────────────────

export default function InfraestructuraPage() {
  const [subTab, setSubTab] = useState<SubTab>("monitoreo");

  return (
    <>
      <TopBar title="Infraestructura" icon={<Radio size={22} />} />
      <div className="flex-1 overflow-auto">
        {/* Sub-tabs */}
        <div className="px-6 pt-4 flex items-center gap-1 border-b border-wuipi-border">
          <button
            onClick={() => setSubTab("monitoreo")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              subTab === "monitoreo"
                ? "border-wuipi-accent text-wuipi-accent"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <span className="flex items-center gap-2"><Eye size={14} /> Monitoreo de Red</span>
          </button>
          <button
            onClick={() => setSubTab("gestion")}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              subTab === "gestion"
                ? "border-wuipi-accent text-wuipi-accent"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            <span className="flex items-center gap-2"><Server size={14} /> Nodos y Servicios</span>
          </button>
        </div>

        <div className="p-6">
          {subTab === "monitoreo" && <MonitoreoTab />}
          {subTab === "gestion" && <GestionTab />}
        </div>
      </div>
    </>
  );
}

// ============================================================
// TAB: Monitoreo de Red (Zabbix)
// ============================================================

function MonitoreoTab() {
  const [overview, setOverview] = useState<InfraOverview | null>(null);
  const [problems, setProblems] = useState<InfraProblem[]>([]);
  const [hosts, setHosts] = useState<InfraHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ov, pr, ho] = await Promise.all([
          fetch("/api/infraestructura").then(r => r.ok ? r.json() : null),
          fetch("/api/infraestructura/problems").then(r => r.ok ? r.json() : { problems: [] }),
          fetch("/api/infraestructura/hosts").then(r => r.ok ? r.json() : { hosts: [] }),
        ]);
        setOverview(ov);
        setProblems(pr.problems || []);
        setHosts(ho.hosts || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {overview?.zabbixConnected === false && <ZabbixBanner />}
      <AlertBanner hosts={hosts} />
      <KPIRow overview={overview} hosts={hosts} />
      <MapaSitios
        sites={overview?.sites || []}
        problems={problems}
        selectedSite={selectedSite}
        onSelectSite={setSelectedSite}
      />
      <ProblemasActivos problems={problems} selectedSite={selectedSite} />
      <PeoresRed hosts={hosts} selectedSite={selectedSite} />
      <DetalleEquipos hosts={hosts} selectedSite={selectedSite} />
    </div>
  );
}

// ============================================================
// TAB: Nodos y Servicios (Mikrotik / Odoo)
// ============================================================

function GestionTab() {
  const [nodes, setNodes] = useState<MikrotikNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<MikrotikNode | null>(null);
  const [services, setServices] = useState<MikrotikService[]>([]);
  const [searchResults, setSearchResults] = useState<MikrotikService[] | null>(null);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch("/api/infraestructura/nodes");
      if (!res.ok) return;
      const data = await res.json();
      setNodes(data.nodes || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  const selectNode = async (node: MikrotikNode) => {
    setSelectedNode(node);
    setSearchResults(null);
    setServiceFilter("");
    setLoadingServices(true);
    try {
      const res = await fetch(`/api/infraestructura/nodes/${node.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.services || []);
    } catch { /* ignore */ }
    finally { setLoadingServices(false); }
  };

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults(null); return; }
    setSelectedNode(null);
    setLoadingServices(true);
    try {
      const res = await fetch(`/api/infraestructura/nodes?search=${encodeURIComponent(search.trim())}`);
      if (!res.ok) return;
      const data = await res.json();
      setSearchResults(data.services || []);
    } catch { /* ignore */ }
    finally { setLoadingServices(false); }
  };

  const totalActive = nodes.reduce((s, n) => s + n.services_active, 0);
  const totalSuspended = nodes.reduce((s, n) => s + n.services_suspended, 0);
  const totalServices = totalActive + totalSuspended;

  const filteredServices = serviceFilter
    ? services.filter((s) => s.state === serviceFilter)
    : services;

  const displayServices = searchResults ?? (selectedNode ? filteredServices : null);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Servicios", value: totalServices, icon: Activity, color: "text-blue-400" },
          { label: "Activos", value: totalActive, icon: Wifi, color: "text-emerald-400" },
          { label: "Suspendidos", value: totalSuspended, icon: AlertTriangle, color: "text-red-400" },
          { label: "Nodos", value: nodes.length, icon: Server, color: "text-purple-400" },
        ].map((kpi) => (
          <Card key={kpi.label} className="!p-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", kpi.color.replace("text-", "bg-") + "/10")}>
                <kpi.icon size={20} className={kpi.color} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{kpi.value.toLocaleString()}</div>
                <div className="text-xs text-gray-500">{kpi.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Buscar por IP, referencia de servicio o nombre de cliente..."
          className="w-full pl-10 pr-4 py-2.5 bg-wuipi-card border border-wuipi-border rounded-lg text-white text-sm outline-none focus:border-wuipi-accent placeholder:text-gray-600"
        />
        {search && (
          <button
            onClick={() => { setSearch(""); setSearchResults(null); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Node grid OR service table */}
      {!displayServices ? (
        <>
          <h3 className="text-sm text-gray-500 font-medium">Nodos de Red ({nodes.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {nodes.map((node) => {
              const pctActive = node.services_total > 0 ? (node.services_active / node.services_total) * 100 : 0;
              return (
                <Card
                  key={node.id}
                  className="!p-4 cursor-pointer hover:border-[#F46800]/30 transition-colors"
                  onClick={() => selectNode(node)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-white font-bold text-lg">{node.name}</span>
                    <ChevronRight size={14} className="text-gray-600" />
                  </div>
                  <div className="text-xs text-gray-500 mb-2">Router: {node.router_name}</div>
                  <div className="w-full h-1.5 bg-wuipi-border rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pctActive}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-400">{node.services_active} activos</span>
                    <span className="text-red-400">{node.services_suspended} susp.</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedNode(null); setSearchResults(null); setServices([]); }}
              className="p-2 rounded-lg border border-wuipi-border hover:bg-wuipi-card-hover text-gray-400 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h3 className="text-white font-semibold">
                {searchResults ? `Resultados: "${search}"` : `Nodo: ${selectedNode?.name}`}
              </h3>
              <p className="text-xs text-gray-500">
                {searchResults
                  ? `${searchResults.length} servicio(s) encontrado(s)`
                  : `${selectedNode?.router_name} — ${selectedNode?.interface_name}`
                }
              </p>
            </div>

            {selectedNode && (
              <div className="ml-auto flex gap-1">
                {[
                  { value: "", label: `Todos (${services.length})` },
                  { value: "progress", label: `Activos (${services.filter(s => s.state === "progress").length})` },
                  { value: "suspended", label: `Susp. (${services.filter(s => s.state === "suspended").length})` },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setServiceFilter(f.value)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
                      serviceFilter === f.value
                        ? "border-[#F46800]/40 bg-[#F46800]/10 text-[#F46800]"
                        : "border-wuipi-border text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loadingServices ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-gray-500" size={24} />
            </div>
          ) : displayServices.length === 0 ? (
            <Card className="!p-8 text-center text-gray-500 text-sm">
              No se encontraron servicios
            </Card>
          ) : (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wuipi-border text-gray-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                      <th className="text-left px-3 py-2.5 font-medium">Plan</th>
                      <th className="text-left px-3 py-2.5 font-medium">IP CPE</th>
                      <th className="text-left px-3 py-2.5 font-medium">IP Red</th>
                      <th className="text-left px-3 py-2.5 font-medium">Sector</th>
                      {searchResults && <th className="text-left px-3 py-2.5 font-medium">Nodo</th>}
                      <th className="text-center px-3 py-2.5 font-medium">Estado</th>
                      <th className="text-left px-3 py-2.5 font-medium">Instalación</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayServices.map((svc) => (
                      <tr key={svc.id} className="border-b border-wuipi-border/30 hover:bg-wuipi-card-hover/30">
                        <td className="px-4 py-2.5">
                          <div className="text-white font-medium truncate max-w-[200px]">{svc.partner_name}</div>
                          <div className="text-xs text-gray-600">{svc.name}</div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-300 text-xs">{svc.product_name.replace(/\[.*?\]\s*/, "")}</td>
                        <td className="px-3 py-2.5 text-gray-300 font-mono text-xs">{svc.ip_cpe || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-300 font-mono text-xs">{svc.ipv4 || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs">{svc.monitoring_sector || "—"}</td>
                        {searchResults && <td className="px-3 py-2.5 text-gray-400 text-xs font-medium">{svc.node_name || "—"}</td>}
                        <td className="px-3 py-2.5 text-center"><StateBadge state={svc.state} /></td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{svc.install_date || "—"}</td>
                        <td className="px-3 py-2.5">
                          {svc.partner_id > 0 && (
                            <Link href={`/clientes/${svc.partner_id}`} className="text-gray-500 hover:text-[#F46800] transition-colors">
                              <ExternalLink size={14} />
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
