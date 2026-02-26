"use client";

import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { InfraProblem, SeverityLevel } from "@/types/zabbix";

interface Props {
  problems: InfraProblem[];
}

const SEVERITY_CONFIG: Record<SeverityLevel, { color: string; bg: string; label: string; barColor: string }> = {
  disaster:       { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", label: "Desastre", barColor: "bg-red-500" },
  high:           { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", label: "Alto", barColor: "bg-orange-500" },
  average:        { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", label: "Medio", barColor: "bg-amber-500" },
  warning:        { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", label: "Advertencia", barColor: "bg-yellow-500" },
  information:    { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", label: "Info", barColor: "bg-blue-500" },
  not_classified: { color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/30", label: "Sin clasificar", barColor: "bg-gray-500" },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function ProblemsList({ problems }: Props) {
  // Count by severity
  const counts = problems.reduce<Record<SeverityLevel, number>>((acc, p) => {
    acc[p.severity] = (acc[p.severity] || 0) + 1;
    return acc;
  }, { not_classified: 0, information: 0, warning: 0, average: 0, high: 0, disaster: 0 });

  const severityOrder: SeverityLevel[] = ["disaster", "high", "average", "warning", "information", "not_classified"];
  const maxCount = Math.max(...Object.values(counts), 1);

  return (
    <div className="space-y-4">
      {/* Severity summary bar */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <AlertTriangle size={16} /> Problemas por Severidad
        </h3>
        <div className="space-y-2">
          {severityOrder.map((sev) => {
            const conf = SEVERITY_CONFIG[sev];
            const count = counts[sev];
            if (count === 0) return null;
            return (
              <div key={sev} className="flex items-center gap-3">
                <span className={`text-xs font-semibold w-24 ${conf.color}`}>{conf.label}</span>
                <div className="flex-1 h-2.5 bg-wuipi-bg rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${conf.barColor}`}
                    style={{ width: `${(count / maxCount) * 100}%`, minWidth: count > 0 ? "8px" : "0" }}
                  />
                </div>
                <span className="text-sm font-bold text-white w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Problems table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">
            Problemas Activos ({problems.length})
          </h3>
        </div>
        <div className="space-y-2 max-h-[500px] overflow-auto">
          {problems.map((problem) => {
            const conf = SEVERITY_CONFIG[problem.severity];
            return (
              <div
                key={problem.id}
                className={`p-3 rounded-lg bg-wuipi-bg border ${conf.bg} transition-colors`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${conf.bg} ${conf.color}`}>
                      {conf.label.toUpperCase()}
                    </span>
                    {problem.acknowledged && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                        <CheckCircle2 size={10} /> ACK
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {formatDuration(problem.duration)}
                  </span>
                </div>
                <p className="text-sm font-medium text-white">{problem.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Host: {problem.hostName} &middot; Inicio: {new Date(problem.startTime).toLocaleString("es-VE")}
                </p>
              </div>
            );
          })}
          {problems.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-sm text-gray-500">Sin problemas activos</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
