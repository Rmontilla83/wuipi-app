"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import type { InfraHost, DetailedEquipmentType } from "@/types/zabbix";

interface Props {
  hosts: InfraHost[];
  selectedSite: string | null;
  defaultExpanded?: boolean;
}

type FilterKey = "all" | "router_core" | "router" | "switch" | "enlaces" | "sector_lbs" | "sector_hbs" | "terragraph" | "station" | "otros";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "router_core", label: "Core" },
  { key: "router", label: "Routers" },
  { key: "switch", label: "Switches" },
  { key: "enlaces", label: "Enlaces" },
  { key: "sector_lbs", label: "LBS" },
  { key: "sector_hbs", label: "HBS" },
  { key: "terragraph", label: "TG" },
  { key: "station", label: "Stations" },
  { key: "otros", label: "Otros" },
];

const ENLACE_TYPES: DetailedEquipmentType[] = [
  "enlace_siklu", "enlace_mikrotik", "enlace_ubiquiti", "enlace_mimosa", "enlace_cambium", "enlace_af60",
];
const OTHER_TYPES: DetailedEquipmentType[] = ["ptmp", "access_point", "hsu", "other"];

function matchesFilter(host: InfraHost, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "enlaces") return ENLACE_TYPES.includes(host.detailedType);
  if (filter === "otros") return OTHER_TYPES.includes(host.detailedType);
  return host.detailedType === filter;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function DetalleEquipos({ hosts, selectedSite, defaultExpanded }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const siteFiltered = selectedSite
    ? hosts.filter((h) => h.site === selectedSite)
    : hosts;

  const filtered = siteFiltered
    .filter((h) => matchesFilter(h, filter))
    .filter((h) => !search || h.name.toLowerCase().includes(search.toLowerCase()) || h.ip.includes(search))
    .sort((a, b) => {
      if (a.status === "offline" && b.status !== "offline") return -1;
      if (a.status !== "offline" && b.status === "offline") return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        Ver todos los equipos ({siteFiltered.length})
        {selectedSite && <span className="text-wuipi-accent font-normal normal-case ml-1">— filtrado por {selectedSite}</span>}
      </button>

      {expanded && (
        <div className="space-y-3">
          {/* Search + Pill filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar host..."
                className="pl-8 pr-3 py-1.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-xs text-white placeholder-gray-600 w-48 focus:outline-none focus:border-wuipi-accent/30"
              />
            </div>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors border ${
                  filter === f.key
                    ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20"
                    : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-wuipi-card z-10">
                  <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                    <th className="text-center py-2.5 px-3 w-8"></th>
                    <th className="text-left py-2.5 px-3">Nombre</th>
                    <th className="text-left py-2.5 px-3">Tipo</th>
                    <th className="text-left py-2.5 px-3">IP</th>
                    <th className="text-left py-2.5 px-3">Sitio</th>
                    <th className="text-right py-2.5 px-3">Latencia</th>
                    <th className="text-right py-2.5 px-3">Pkt Loss</th>
                    <th className="text-right py-2.5 px-3">Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((host) => (
                    <tr key={host.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                      <td className="py-1.5 px-3 text-center">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                          host.status === "online" ? "bg-emerald-400" :
                          host.status === "offline" ? "bg-red-500 animate-pulse" : "bg-gray-400"
                        }`} />
                      </td>
                      <td className="py-1.5 px-3 text-white font-medium text-xs truncate max-w-[180px]">{host.name}</td>
                      <td className="py-1.5 px-3 text-gray-500 text-[10px]">{host.detailedTypeLabel}</td>
                      <td className="py-1.5 px-3 text-gray-400 text-xs font-mono">{host.ip}</td>
                      <td className="py-1.5 px-3 text-gray-400 text-xs">{host.site}</td>
                      <td className={`py-1.5 px-3 text-right font-bold text-xs ${
                        host.latency === null ? "text-gray-600" :
                        host.latency > 15 ? "text-red-400" :
                        host.latency > 5 ? "text-amber-400" : "text-emerald-400"
                      }`}>
                        {host.latency !== null ? `${host.latency.toFixed(1)}ms` : "—"}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-bold text-xs ${
                        host.packetLoss === null ? "text-gray-600" :
                        host.packetLoss > 2 ? "text-red-400" :
                        host.packetLoss > 0.5 ? "text-amber-400" : "text-emerald-400"
                      }`}>
                        {host.packetLoss !== null ? `${host.packetLoss.toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs text-gray-400">
                        {formatUptime(host.uptime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">No hay equipos con este filtro</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
