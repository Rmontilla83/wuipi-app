"use client";

import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard";
import type { InfraOverview, InfraHost } from "@/types/zabbix";

interface Props {
  overview: InfraOverview | null;
  hosts: InfraHost[];
}

export function KPIRow({ overview, hosts }: Props) {
  const o = overview;
  const online = o?.hostsUp ?? 0;
  const total = o?.totalHosts ?? 0;
  const health = o?.healthScore ?? 0;
  const totalProblems = o?.totalProblems ?? 0;

  // Compute average latency from hosts with icmppingsec data
  const hostsWithLatency = hosts.filter((h) => h.latency !== null && h.latency > 0);
  const avgLatency = hostsWithLatency.length > 0
    ? hostsWithLatency.reduce((sum, h) => sum + (h.latency ?? 0), 0) / hostsWithLatency.length
    : 0;

  // Problem breakdown
  const sev = o?.problemsBySeverity;
  const highCount = (sev?.high ?? 0) + (sev?.disaster ?? 0);
  const avgCount = sev?.average ?? 0;
  const warnCount = sev?.warning ?? 0;

  // Active percentage for progress bar
  const pct = total > 0 ? Math.round((online / total) * 100) : 0;

  // Health color
  const healthColor = health >= 95 ? "text-emerald-400" : health >= 80 ? "text-amber-400" : "text-red-400";

  // Latency color
  const latColor = avgLatency < 5 ? "text-emerald-400" : avgLatency < 20 ? "text-amber-400" : "text-red-400";

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Equipos Activos */}
      <Card className="!p-5">
        <p className="text-xs text-gray-500 mb-1">Equipos Activos</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white">{online}</span>
          <span className="text-lg text-gray-500">/{total}</span>
        </div>
        <div className="mt-2 h-2 bg-wuipi-bg rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-600 mt-1">{pct}% en linea</p>
      </Card>

      {/* Health Score */}
      <Card className="!p-5">
        <p className="text-xs text-gray-500 mb-1">Health Score</p>
        <div className="flex items-center gap-4">
          <ScoreRing score={health} size={64} />
          <span className={`text-3xl font-bold ${healthColor}`}>{health}%</span>
        </div>
      </Card>

      {/* Problemas Activos */}
      <Card className="!p-5">
        <p className="text-xs text-gray-500 mb-1">Problemas Activos</p>
        <span className="text-3xl font-bold text-white">{totalProblems}</span>
        {totalProblems > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {highCount > 0 && (
              <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-bold">
                {highCount} HIGH
              </span>
            )}
            {avgCount > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px] font-bold">
                {avgCount} AVG
              </span>
            )}
            {warnCount > 0 && (
              <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded text-[10px] font-bold">
                {warnCount} WARN
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Latencia Promedio */}
      <Card className="!p-5">
        <p className="text-xs text-gray-500 mb-1">Latencia Promedio</p>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${latColor}`}>{avgLatency.toFixed(1)}</span>
          <span className="text-sm text-gray-500">ms</span>
        </div>
        <p className="text-[10px] text-gray-600 mt-1">
          {hostsWithLatency.length} hosts con datos
        </p>
      </Card>
    </div>
  );
}
