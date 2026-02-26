"use client";

import { Card } from "@/components/ui/card";
import type { InfraProblem, SeverityLevel } from "@/types/zabbix";
import { AlertTriangle } from "lucide-react";

interface Props {
  problems: InfraProblem[];
}

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  disaster: 0, high: 1, average: 2, warning: 3, information: 4, not_classified: 5,
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  disaster: { bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-500", label: "DISASTER" },
  high:     { bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400", label: "HIGH" },
  average:  { bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-400", label: "AVERAGE" },
  warning:  { bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-400", label: "WARNING" },
  information: { bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-400", label: "INFO" },
  not_classified: { bg: "bg-gray-500/10", border: "border-gray-500/30", dot: "bg-gray-400", label: "N/C" },
};

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `hace ${days}d`;
  if (hours > 0) return `hace ${hours}h`;
  return `hace ${Math.floor(seconds / 60)}m`;
}

export function ProblemasActivos({ problems }: Props) {
  const sorted = [...problems].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
  );

  const counts = problems.reduce<Partial<Record<SeverityLevel, number>>>((acc, p) => {
    acc[p.severity] = (acc[p.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle size={14} /> Problemas Activos
        </h3>
        <div className="flex gap-1.5">
          {(["high", "average", "warning"] as SeverityLevel[]).map((sev) => {
            const c = counts[sev];
            if (!c) return null;
            const style = SEVERITY_STYLES[sev];
            return (
              <span key={sev} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${style.bg} ${style.dot.replace("bg-", "text-")}`}>
                {c} {style.label}
              </span>
            );
          })}
        </div>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-auto max-h-[350px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-wuipi-card z-10">
              <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                <th className="text-left py-2.5 px-4">Severidad</th>
                <th className="text-left py-2.5 px-3">Host</th>
                <th className="text-left py-2.5 px-3">Problema</th>
                <th className="text-left py-2.5 px-3">Duracion</th>
                <th className="text-left py-2.5 px-3">Sitio</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const style = SEVERITY_STYLES[p.severity] || SEVERITY_STYLES.not_classified;
                return (
                  <tr key={p.id} className={`border-b border-wuipi-border/50 hover:bg-wuipi-card-hover`}>
                    <td className="py-2 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${style.bg} ${style.border} border`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {style.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-white font-medium text-xs truncate max-w-[150px]">{p.hostName}</td>
                    <td className="py-2 px-3 text-gray-300 text-xs truncate max-w-[250px]">{p.name}</td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{formatDuration(p.duration)}</td>
                    <td className="py-2 px-3 text-gray-400 text-xs">{p.site}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {problems.length === 0 && (
          <p className="text-sm text-emerald-400 text-center py-8">Sin problemas activos</p>
        )}
      </Card>
    </div>
  );
}
