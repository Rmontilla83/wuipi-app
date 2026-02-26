"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { InfraHost, DetailedEquipmentType } from "@/types/zabbix";

interface Props {
  hosts: InfraHost[];
  selectedSite: string | null;
}

type FilterKey = "all" | "router_core" | "router" | "switch" | "enlaces" | "sector_lbs" | "sector_hbs" | "terragraph" | "station" | "otros";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "router_core", label: "Routers Core" },
  { key: "router", label: "Routers" },
  { key: "switch", label: "Switches" },
  { key: "enlaces", label: "Enlaces PtP" },
  { key: "sector_lbs", label: "Sectores LBS" },
  { key: "sector_hbs", label: "Sectores HBS" },
  { key: "terragraph", label: "Terragraph" },
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
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function EquiposPorTipo({ hosts, selectedSite }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = hosts
    .filter((h) => matchesFilter(h, filter))
    .filter((h) => !selectedSite || h.site === selectedSite)
    .sort((a, b) => {
      // Offline first, then by name
      if (a.status === "offline" && b.status !== "offline") return -1;
      if (a.status !== "offline" && b.status === "offline") return 1;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Equipos por Tipo</h3>

      {/* Pill filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              filter === f.key
                ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20"
                : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-wuipi-card z-10">
              <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                <th className="text-left py-2.5 px-4">Nombre</th>
                <th className="text-left py-2.5 px-3">IP</th>
                <th className="text-center py-2.5 px-3">Estado</th>
                <th className="text-right py-2.5 px-3">Latencia</th>
                <th className="text-right py-2.5 px-3">Pkt Loss</th>
                <th className="text-right py-2.5 px-3">Uptime</th>
                <th className="text-left py-2.5 px-3">Sitio</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((host) => (
                <tr key={host.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                  <td className="py-2 px-4">
                    <p className="font-medium text-white truncate max-w-[200px]">{host.name}</p>
                    <p className="text-[10px] text-gray-600">{host.detailedTypeLabel}</p>
                  </td>
                  <td className="py-2 px-3 text-gray-400 text-xs font-mono">{host.ip}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                      host.status === "online" ? "bg-emerald-400" :
                      host.status === "offline" ? "bg-red-500 animate-pulse" : "bg-gray-400"
                    }`} />
                  </td>
                  <td className={`py-2 px-3 text-right font-bold text-xs ${
                    host.latency === null ? "text-gray-600" :
                    host.latency > 50 ? "text-red-400" :
                    host.latency > 10 ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {host.latency !== null ? `${host.latency.toFixed(1)}ms` : "—"}
                  </td>
                  <td className={`py-2 px-3 text-right font-bold text-xs ${
                    host.packetLoss === null ? "text-gray-600" :
                    host.packetLoss > 2 ? "text-red-400" :
                    host.packetLoss > 0.5 ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {host.packetLoss !== null ? `${host.packetLoss.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right text-xs text-gray-400">
                    {formatUptime(host.uptime)}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-400">{host.site}</td>
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
  );
}
