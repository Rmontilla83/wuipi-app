"use client";

import { Card } from "@/components/ui/card";
import { ArrowDownUp } from "lucide-react";
import type { InterfaceBandwidth } from "@/types/zabbix";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Props {
  bandwidth: InterfaceBandwidth[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}

export function BandwidthCharts({ bandwidth }: Props) {
  // Use primary trunk/router for the main chart
  const primaryLink = bandwidth.find((b) => b.history.length > 0);
  const chartData = primaryLink
    ? primaryLink.history.map((point) => ({
        time: formatTime(point.time),
        in: point.inValue,
        out: point.outValue,
      }))
    : [];

  // Top 10 by total bandwidth
  const topInterfaces = [...bandwidth]
    .sort((a, b) => (b.inMbps + b.outMbps) - (a.inMbps + a.outMbps))
    .slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Bandwidth chart */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <ArrowDownUp size={16} /> Tráfico de Red (Mbps)
          {primaryLink && (
            <span className="text-xs text-gray-500 font-normal ml-2">
              {primaryLink.hostName} &mdash; {primaryLink.interfaceName}
            </span>
          )}
        </h3>
        {chartData.length > 0 ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bwInGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bwOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} unit=" Mbps" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e1e2e", border: "1px solid #333", borderRadius: "8px" }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(1)} Mbps`,
                    name === "in" ? "Entrada" : "Salida",
                  ]}
                />
                <Legend formatter={(value) => (value === "in" ? "Entrada" : "Salida")} />
                <Area
                  type="monotone" dataKey="in" stroke="#06b6d4" strokeWidth={2}
                  fill="url(#bwInGrad)"
                />
                <Area
                  type="monotone" dataKey="out" stroke="#8b5cf6" strokeWidth={2}
                  fill="url(#bwOutGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-12">Sin datos de historial</p>
        )}
      </Card>

      {/* Top 10 interfaces table */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4">
          Top 10 Interfaces por Tráfico
        </h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-wuipi-border">
                <th className="text-left py-2 pr-4">#</th>
                <th className="text-left py-2 pr-4">Host</th>
                <th className="text-left py-2 pr-4">Interfaz</th>
                <th className="text-right py-2 px-3">Entrada</th>
                <th className="text-right py-2 px-3">Salida</th>
                <th className="text-right py-2 pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {topInterfaces.map((iface, i) => (
                <tr key={`${iface.hostId}-${i}`} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                  <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                  <td className="py-2 pr-4 font-medium text-white">{iface.hostName}</td>
                  <td className="py-2 pr-4 text-gray-400 text-xs">{iface.interfaceName}</td>
                  <td className="py-2 px-3 text-right font-bold text-cyan-400">
                    {iface.inMbps.toFixed(1)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-violet-400">
                    {iface.outMbps.toFixed(1)}
                  </td>
                  <td className="py-2 pl-3 text-right font-bold text-white">
                    {(iface.inMbps + iface.outMbps).toFixed(1)} Mbps
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {topInterfaces.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">Sin datos de ancho de banda</p>
        )}
      </Card>
    </div>
  );
}
