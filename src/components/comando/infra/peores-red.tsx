"use client";

import { Card } from "@/components/ui/card";
import type { InfraHost } from "@/types/zabbix";

interface Props {
  hosts: InfraHost[];
  selectedSite: string | null;
}

export function PeoresRed({ hosts, selectedSite }: Props) {
  const filtered = selectedSite
    ? hosts.filter((h) => h.site === selectedSite)
    : hosts;

  // Top 10 worst latency
  const worstLatency = filtered
    .filter((h) => h.latency !== null && h.latency > 0)
    .sort((a, b) => (b.latency ?? 0) - (a.latency ?? 0))
    .slice(0, 10);

  const maxLat = worstLatency.length > 0 ? (worstLatency[0].latency ?? 1) : 1;

  // Top 10 worst packet loss (only > 0%)
  const worstLoss = filtered
    .filter((h) => h.packetLoss !== null && h.packetLoss > 0)
    .sort((a, b) => (b.packetLoss ?? 0) - (a.packetLoss ?? 0))
    .slice(0, 10);

  const maxLoss = worstLoss.length > 0 ? (worstLoss[0].packetLoss ?? 1) : 1;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Peores de la Red</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Worst Latency */}
        <Card>
          <h4 className="text-xs font-bold text-white mb-3">Mayor Latencia</h4>
          {worstLatency.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">Sin datos de latencia</p>
          ) : (
            <div className="space-y-2">
              {worstLatency.map((h) => {
                const lat = h.latency ?? 0;
                const pct = Math.max((lat / maxLat) * 100, 8);
                const color = lat > 15 ? "bg-red-500" : lat > 5 ? "bg-amber-500" : "bg-emerald-500";
                const textColor = lat > 15 ? "text-red-400" : lat > 5 ? "text-amber-400" : "text-emerald-400";
                return (
                  <div key={h.id}>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-xs text-gray-300 truncate max-w-[60%]">{h.name}</span>
                      <span className={`text-xs font-bold ${textColor}`}>{lat.toFixed(1)}ms</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Worst Packet Loss */}
        <Card>
          <h4 className="text-xs font-bold text-white mb-3">Mayor Packet Loss</h4>
          {worstLoss.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs text-emerald-400 font-medium">Sin perdida de paquetes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {worstLoss.map((h) => {
                const loss = h.packetLoss ?? 0;
                const pct = Math.max((loss / maxLoss) * 100, 8);
                const color = loss > 5 ? "bg-red-500" : loss > 1 ? "bg-amber-500" : "bg-emerald-500";
                const textColor = loss > 5 ? "text-red-400" : loss > 1 ? "text-amber-400" : "text-emerald-400";
                return (
                  <div key={h.id}>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-xs text-gray-300 truncate max-w-[60%]">{h.name}</span>
                      <span className={`text-xs font-bold ${textColor}`}>{loss.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
