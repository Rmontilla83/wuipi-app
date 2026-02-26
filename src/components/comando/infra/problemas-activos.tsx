"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { InfraProblem, SeverityLevel } from "@/types/zabbix";

interface Props {
  problems: InfraProblem[];
  selectedSite: string | null;
}

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  disaster: 0, high: 1, average: 2, warning: 3, information: 4, not_classified: 5,
};

function formatTimeAgo(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} meses`;
}

export function ProblemasActivos({ problems, selectedSite }: Props) {
  const [showWarnings, setShowWarnings] = useState(false);

  const filtered = selectedSite
    ? problems.filter((p) => p.site === selectedSite)
    : problems;

  const critical = filtered.filter((p) => p.severity === "high" || p.severity === "disaster" || p.severity === "average");
  const warnings = filtered.filter((p) => p.severity === "warning" || p.severity === "information" || p.severity === "not_classified");

  const displayed = showWarnings ? filtered : critical;

  // Sort by severity desc, then by duration desc (oldest unresolved first)
  const sorted = [...displayed].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
    if (sevDiff !== 0) return sevDiff;
    return b.duration - a.duration;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
          Problemas que Requieren Atencion
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {critical.length} critico{critical.length !== 1 ? "s" : ""}
            {warnings.length > 0 && (
              <>
                <span className="text-gray-600"> · </span>
                <button
                  onClick={() => setShowWarnings(!showWarnings)}
                  className="text-wuipi-accent hover:underline"
                >
                  {warnings.length} warnings {showWarnings ? "ocultar" : "mostrar"}
                </button>
              </>
            )}
          </span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-sm text-emerald-400 font-medium">Sin problemas criticos</p>
        </div>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-auto max-h-[350px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-wuipi-card z-10">
                <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                  <th className="text-center py-2.5 px-3 w-10"></th>
                  <th className="text-left py-2.5 px-3">Host</th>
                  <th className="text-left py-2.5 px-3">Problema</th>
                  <th className="text-left py-2.5 px-3">Tiempo</th>
                  <th className="text-left py-2.5 px-3">Sitio</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const isHigh = p.severity === "high" || p.severity === "disaster";
                  const isAvg = p.severity === "average";
                  const rowBg = isHigh
                    ? "bg-red-500/5"
                    : isAvg
                    ? "bg-amber-500/5"
                    : "";

                  return (
                    <tr key={p.id} className={`border-b border-wuipi-border/50 hover:bg-wuipi-card-hover ${rowBg}`}>
                      <td className="py-2 px-3 text-center">
                        {isHigh && <span className="text-base">🔴</span>}
                        {isAvg && <span className="text-base">🟠</span>}
                        {!isHigh && !isAvg && <span className="text-base">🟡</span>}
                      </td>
                      <td className="py-2 px-3 text-white font-medium text-xs truncate max-w-[150px]">{p.hostName}</td>
                      <td className="py-2 px-3 text-gray-300 text-xs truncate max-w-[250px]">{p.name}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs whitespace-nowrap">{formatTimeAgo(p.duration)}</td>
                      <td className="py-2 px-3 text-gray-400 text-xs">{p.site}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
