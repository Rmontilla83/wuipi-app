"use client";

import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard";
import { Activity, Server, AlertTriangle, ArrowUp, ShieldCheck } from "lucide-react";
import type { InfraOverview } from "@/types/zabbix";

interface Props {
  data: InfraOverview | null;
}

function trafficLight(score: number): { color: string; label: string; bg: string } {
  if (score >= 85) return { color: "text-emerald-400", label: "Operativo", bg: "bg-emerald-500" };
  if (score >= 60) return { color: "text-amber-400", label: "Degradado", bg: "bg-amber-500" };
  return { color: "text-red-400", label: "Crítico", bg: "bg-red-500" };
}

export function NetworkOverviewPanel({ data }: Props) {
  if (!data) return null;

  const tl = trafficLight(data.healthScore);
  const totalProblems = Object.values(data.problemsBySeverity).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Traffic light indicator */}
      <div className="flex items-center gap-3">
        <div className={`w-4 h-4 rounded-full ${tl.bg} shadow-lg animate-pulse`} />
        <span className={`text-sm font-bold ${tl.color}`}>{tl.label}</span>
        <span className="text-xs text-gray-500">
          Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}
        </span>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="flex flex-col items-center justify-center py-4">
          <ScoreRing score={data.healthScore} size={72} />
          <p className="text-xs font-semibold text-white mt-2">Health Score</p>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Server size={15} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Hosts Online</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{data.hostsUp}</p>
          <p className="text-xs text-gray-500 mt-1">de {data.totalHosts} total</p>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Activity size={15} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Hosts Caídos</span>
          </div>
          <p className={`text-2xl font-bold ${data.hostsDown > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {data.hostsDown}
          </p>
          <p className="text-xs text-gray-500 mt-1">{data.hostsUnknown} desconocidos</p>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Alertas</span>
          </div>
          <p className={`text-2xl font-bold ${totalProblems > 5 ? "text-amber-400" : "text-white"}`}>
            {totalProblems}
          </p>
          <div className="flex gap-1 mt-1">
            {data.problemsBySeverity.disaster > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400">
                {data.problemsBySeverity.disaster} DISA
              </span>
            )}
            {data.problemsBySeverity.high > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400">
                {data.problemsBySeverity.high} ALTO
              </span>
            )}
            {data.problemsBySeverity.average > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
                {data.problemsBySeverity.average} MED
              </span>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-2">
            <ArrowUp size={15} className="text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Uptime</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.uptimePercent}%</p>
          <div className="flex items-center gap-1 mt-1">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span className="text-xs text-emerald-400">SLA</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
