"use client";

import { useEffect, useState } from "react";
import { History, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import type { BequantMonthlyDpiRow } from "@/types/bequant";

function formatBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${names[parseInt(m) - 1]} ${y.slice(2)}`;
}

const APP_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6", "#f97316",
];

export function MonthlyDpiHistory({ ip }: { ip: string }) {
  const [rows, setRows] = useState<BequantMonthlyDpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bequant/subscribers/${encodeURIComponent(ip)}/dpi-monthly`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error");
        setRows(json.data || []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [ip]);

  if (loading) {
    return (
      <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
        <div className="flex items-center justify-center h-32">
          <RefreshCw className="w-5 h-5 text-wuipi-accent animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
        <h3 className="text-sm text-gray-500 mb-2 flex items-center gap-2">
          <History size={16} /> Histórico de uso
        </h3>
        <div className="text-sm text-gray-500 py-6 text-center">
          Sin histórico aún. Los datos se capturan semanalmente vía cron rotativo.
        </div>
      </div>
    );
  }

  // Build stacked area data: month x top-5 apps
  const allApps = new Set<string>();
  rows.forEach(r => (r.top_dl || []).slice(0, 5).forEach(a => allApps.add(a.name)));
  const topApps = Array.from(allApps);

  const chartData = [...rows].reverse().map(r => {
    const base: Record<string, number | string> = { month: monthLabel(r.year_month) };
    topApps.forEach(app => {
      const found = (r.top_dl || []).find(a => a.name === app);
      base[app] = found?.bytes || 0;
    });
    return base;
  });

  // Comparativo mes actual vs anterior
  const current = rows[0];
  const prev = rows[1];
  const currentMap = new Map((current?.top_dl || []).map(a => [a.name, a.bytes]));
  const prevMap = new Map((prev?.top_dl || []).map(a => [a.name, a.bytes]));
  const comparison = Array.from(currentMap.entries()).slice(0, 10).map(([name, bytes]) => {
    const prevBytes = prevMap.get(name) || 0;
    const delta = prevBytes > 0 ? ((bytes - prevBytes) / prevBytes) * 100 : null;
    return { name, bytes, prevBytes, delta };
  });

  return (
    <div className="space-y-4">
      <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
        <h3 className="text-sm text-gray-500 mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <History size={16} /> Uso mensual — últimos {rows.length} mes{rows.length === 1 ? "" : "es"}
          </span>
          <span className="text-xs text-gray-600">
            Total mes: {formatBytes(current?.total_dl_bytes || 0)} DL · {formatBytes(current?.total_ul_bytes || 0)} UL
          </span>
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11}
              tickFormatter={(v) => formatBytes(Number(v)).replace(" ", "")} />
            <Tooltip
              contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }}
              formatter={(v: number) => formatBytes(v)}
            />
            <Legend />
            {topApps.map((app, i) => (
              <Area
                key={app}
                type="monotone"
                dataKey={app}
                stackId="1"
                stroke={APP_COLORS[i % APP_COLORS.length]}
                fill={APP_COLORS[i % APP_COLORS.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {prev && (
        <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
          <h3 className="text-sm text-gray-500 mb-3">
            Comparativo: {monthLabel(current.year_month)} vs {monthLabel(prev.year_month)}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase border-b border-wuipi-border">
                <th className="py-2">App</th>
                <th className="py-2 text-right">Actual</th>
                <th className="py-2 text-right">Anterior</th>
                <th className="py-2 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map(row => (
                <tr key={row.name} className="border-b border-wuipi-border/50">
                  <td className="py-2 text-gray-200">{row.name}</td>
                  <td className="py-2 text-right text-white font-mono">{formatBytes(row.bytes)}</td>
                  <td className="py-2 text-right text-gray-500 font-mono">{formatBytes(row.prevBytes)}</td>
                  <td className="py-2 text-right">
                    {row.delta === null ? (
                      <span className="text-xs text-gray-500 flex items-center justify-end gap-1">
                        <Minus size={10} /> nuevo
                      </span>
                    ) : row.delta > 10 ? (
                      <span className="text-xs text-green-400 flex items-center justify-end gap-1">
                        <TrendingUp size={10} /> +{row.delta.toFixed(0)}%
                      </span>
                    ) : row.delta < -10 ? (
                      <span className="text-xs text-red-400 flex items-center justify-end gap-1">
                        <TrendingDown size={10} /> {row.delta.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">{row.delta.toFixed(0)}%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-gray-600 flex items-center gap-1">
        <History size={10} />
        Muestreo semanal agregado · {current?.days_sampled || 0} días capturados este mes · retención 12 meses
      </div>
    </div>
  );
}
