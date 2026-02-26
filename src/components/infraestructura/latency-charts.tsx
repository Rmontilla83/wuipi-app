"use client";

import { Card } from "@/components/ui/card";
import { Clock } from "lucide-react";
import type { HostLatency } from "@/types/zabbix";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  latencies: HostLatency[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}

export function LatencyCharts({ latencies }: Props) {
  // Merge all histories into a single chart dataset
  // Use first host with history data for the area chart
  const primaryHost = latencies.find((l) => l.history.length > 0);
  const chartData = primaryHost
    ? primaryHost.history.map((point) => ({
        time: formatTime(point.time),
        value: Math.round(point.value * 100) / 100,
      }))
    : [];

  // Top 10 worst latency hosts
  const topWorst = [...latencies]
    .sort((a, b) => b.current - a.current)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Latency chart */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Clock size={16} /> Latencia Promedio (ms)
          {primaryHost && (
            <span className="text-xs text-gray-500 font-normal ml-2">
              {primaryHost.hostName}
            </span>
          )}
        </h3>
        {chartData.length > 0 ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} unit="ms" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e1e2e", border: "1px solid #333", borderRadius: "8px" }}
                  labelStyle={{ color: "#fff" }}
                  itemStyle={{ color: "#06b6d4" }}
                  formatter={(value: number) => [`${value.toFixed(2)} ms`, "Latencia"]}
                />
                <Area
                  type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2}
                  fill="url(#latencyGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">Sin datos de historial</p>
        )}
      </Card>

      {/* Top 10 worst latency table */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4">
          Top 10 Peor Latencia
        </h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                <th className="text-left py-2 pr-4">#</th>
                <th className="text-left py-2 pr-4">Host</th>
                <th className="text-right py-2 px-3">Actual</th>
                <th className="text-right py-2 px-3">Promedio</th>
                <th className="text-right py-2 px-3">Máximo</th>
                <th className="text-right py-2 pl-3">Pkt Loss</th>
              </tr>
            </thead>
            <tbody>
              {topWorst.map((host, i) => (
                <tr key={host.hostId} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                  <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-4 font-medium text-white">{host.hostName}</td>
                  <td className={`py-2 px-3 text-right font-bold ${
                    host.current > 50 ? "text-red-400" : host.current > 20 ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {host.current.toFixed(1)}ms
                  </td>
                  <td className="py-2 px-3 text-right text-gray-300">{host.avg.toFixed(1)}ms</td>
                  <td className="py-2 px-3 text-right text-gray-300">{host.max.toFixed(1)}ms</td>
                  <td className={`py-2 pl-3 text-right font-bold ${
                    host.packetLoss > 2 ? "text-red-400" : host.packetLoss > 0.5 ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {host.packetLoss.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {topWorst.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Sin datos de latencia</p>
        )}
      </Card>
    </div>
  );
}
