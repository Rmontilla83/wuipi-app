"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Network, Radio, Server, BatteryCharging, Cable, MonitorSmartphone, Box, Cpu,
} from "lucide-react";
import type { InfraHost, EquipmentType } from "@/types/zabbix";
import type { LucideIcon } from "lucide-react";

interface Props {
  hosts: InfraHost[];
}

const TYPE_CONFIG: Record<EquipmentType, { icon: LucideIcon; label: string; color: string }> = {
  router:  { icon: Network, label: "Router", color: "text-cyan-400" },
  switch:  { icon: MonitorSmartphone, label: "Switch", color: "text-blue-400" },
  ap:      { icon: Radio, label: "AP", color: "text-violet-400" },
  server:  { icon: Server, label: "Servidor", color: "text-emerald-400" },
  ups:     { icon: BatteryCharging, label: "UPS", color: "text-amber-400" },
  trunk:   { icon: Cable, label: "Troncal", color: "text-pink-400" },
  olt:     { icon: Cpu, label: "OLT", color: "text-orange-400" },
  other:   { icon: Box, label: "Otro", color: "text-gray-400" },
};

const STATUS_COLORS: Record<string, { dot: string; text: string; bg: string; label: string }> = {
  online:  { dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400/10", label: "En línea" },
  offline: { dot: "bg-red-400 animate-pulse", text: "text-red-400", bg: "bg-red-400/10", label: "Caído" },
  unknown: { dot: "bg-gray-400", text: "text-gray-400", bg: "bg-gray-400/10", label: "Desconocido" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

const FILTER_OPTIONS: { key: EquipmentType | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "router", label: "Routers" },
  { key: "olt", label: "OLTs" },
  { key: "switch", label: "Switches" },
  { key: "ap", label: "APs" },
  { key: "server", label: "Servidores" },
  { key: "ups", label: "UPS" },
  { key: "trunk", label: "Troncales" },
];

export function HostGrid({ hosts }: Props) {
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "all">("all");

  const filtered = typeFilter === "all" ? hosts : hosts.filter((h) => h.type === typeFilter);
  const counts = hosts.reduce<Record<string, number>>((acc, h) => {
    acc[h.type] = (acc[h.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTER_OPTIONS.map((opt) => {
          const count = opt.key === "all" ? hosts.length : (counts[opt.key] || 0);
          return (
            <button
              key={opt.key}
              onClick={() => setTypeFilter(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                typeFilter === opt.key
                  ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20"
                  : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
              }`}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((host) => {
          const typeConf = TYPE_CONFIG[host.type] || TYPE_CONFIG.other;
          const statusConf = STATUS_COLORS[host.status] || STATUS_COLORS.unknown;
          const Icon = typeConf.icon;

          return (
            <Card key={host.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon size={18} className={typeConf.color} />
                  <div>
                    <p className="text-sm font-semibold text-white truncate max-w-[160px]">{host.name}</p>
                    <p className="text-[10px] text-gray-500">{host.ip}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${statusConf.bg} ${statusConf.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                  {statusConf.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {host.latency !== null && (
                  <div>
                    <span className="text-gray-500">Latencia</span>
                    <p className={`font-bold ${host.latency > 50 ? "text-red-400" : host.latency > 20 ? "text-amber-400" : "text-white"}`}>
                      {host.latency.toFixed(1)}ms
                    </p>
                  </div>
                )}
                {host.packetLoss !== null && (
                  <div>
                    <span className="text-gray-500">Pkt Loss</span>
                    <p className={`font-bold ${host.packetLoss > 2 ? "text-red-400" : host.packetLoss > 0.5 ? "text-amber-400" : "text-white"}`}>
                      {host.packetLoss.toFixed(1)}%
                    </p>
                  </div>
                )}
                {host.bandwidthIn !== null && (
                  <div>
                    <span className="text-gray-500">BW In</span>
                    <p className="font-bold text-cyan-400">{host.bandwidthIn.toFixed(0)} Mbps</p>
                  </div>
                )}
                {host.bandwidthOut !== null && (
                  <div>
                    <span className="text-gray-500">BW Out</span>
                    <p className="font-bold text-violet-400">{host.bandwidthOut.toFixed(0)} Mbps</p>
                  </div>
                )}
                {host.connectedClients !== null && (
                  <div>
                    <span className="text-gray-500">Clientes</span>
                    <p className="font-bold text-white">{host.connectedClients}</p>
                  </div>
                )}
              </div>

              {host.lastStateChange && (
                <div className="mt-2 pt-2 border-t border-wuipi-border/50">
                  <span className="text-[10px] text-gray-600">
                    Cambio: {timeAgo(host.lastStateChange)}
                  </span>
                </div>
              )}

              {host.error && (
                <div className="mt-2 px-2 py-1 bg-red-500/5 border border-red-500/20 rounded text-[10px] text-red-400 truncate">
                  {host.error}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No hay equipos con este filtro</p>
      )}
    </div>
  );
}
