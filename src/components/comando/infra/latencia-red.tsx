"use client";

import { Card } from "@/components/ui/card";
import type { InfraHost } from "@/types/zabbix";

interface Props {
  hosts: InfraHost[];
}

export function LatenciaRed({ hosts }: Props) {
  // Top 15 hosts by worst latency (only hosts with latency data)
  const ranked = hosts
    .filter((h) => h.latency !== null && h.latency > 0)
    .sort((a, b) => (b.latency ?? 0) - (a.latency ?? 0))
    .slice(0, 15);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Latencia de Red</h3>
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-auto max-h-[350px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-wuipi-card z-10">
              <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                <th className="text-left py-2.5 px-4">Host</th>
                <th className="text-left py-2.5 px-3">Sitio</th>
                <th className="text-left py-2.5 px-3">Tipo</th>
                <th className="text-right py-2.5 px-3">Latencia</th>
                <th className="text-right py-2.5 px-3">Pkt Loss</th>
                <th className="text-center py-2.5 px-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((host) => {
                const latency = host.latency ?? 0;
                const latColor = latency > 50 ? "text-red-400" : latency > 10 ? "text-amber-400" : "text-emerald-400";
                const lossColor = (host.packetLoss ?? 0) > 2 ? "text-red-400" : (host.packetLoss ?? 0) > 0.5 ? "text-amber-400" : "text-emerald-400";
                return (
                  <tr key={host.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                    <td className="py-2 px-4 text-white font-medium text-xs truncate max-w-[180px]">{host.name}</td>
                    <td className="py-2 px-3 text-gray-400 text-xs">{host.site}</td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{host.detailedTypeLabel}</td>
                    <td className={`py-2 px-3 text-right font-bold text-xs ${latColor}`}>
                      {latency.toFixed(1)}ms
                    </td>
                    <td className={`py-2 px-3 text-right font-bold text-xs ${lossColor}`}>
                      {host.packetLoss !== null ? `${host.packetLoss.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                        host.status === "online" ? "bg-emerald-400" :
                        host.status === "offline" ? "bg-red-500 animate-pulse" : "bg-gray-400"
                      }`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ranked.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">Sin datos de latencia</p>
        )}
      </Card>
    </div>
  );
}
