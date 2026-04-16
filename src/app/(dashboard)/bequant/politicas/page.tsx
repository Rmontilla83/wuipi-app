"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { BequantSubNav } from "@/components/bequant/sub-nav";
import { Shield, RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BequantPolicyRow } from "@/types/bequant";

function formatRate(kbps: number): string {
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(2)} Gbps`;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
  return `${kbps} kbps`;
}

export default function BequantPoliciesPage() {
  const [policies, setPolicies] = useState<BequantPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPolicies = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch("/api/bequant/policies", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setPolicies(Array.isArray(json) ? json : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  return (
    <div className="min-h-screen bg-wuipi-bg">
      <TopBar
        title="Políticas Bequant"
        subtitle={`${policies.length} políticas configuradas vía API`}
        actions={
          <button
            onClick={() => fetchPolicies(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wuipi-card border border-wuipi-border rounded-lg hover:border-wuipi-accent disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            Refrescar
          </button>
        }
      />

      <div className="p-6 space-y-4">
        <BequantSubNav />

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-medium text-blue-400">Módulo de solo lectura</p>
            <p className="text-xs text-gray-500 mt-1">
              Las políticas se configuran directamente en el BQN por el ingeniero de red.
              Esta vista solo muestra las políticas expuestas vía la API REST del appliance
              (típicamente las que tienen sufijo &quot;-API&quot;). El resto de políticas (Legacy-*, Dedicated,
              rate-default, Ded-200, etc.) son internas y se administran vía SSH/GUI del BQN.
            </p>
          </div>
        </div>

        <div className="bg-wuipi-card border border-wuipi-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-wuipi-accent animate-spin" />
            </div>
          ) : policies.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">
              Sin políticas expuestas vía API. Aún no se ha ejecutado el sync.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-wuipi-bg border-b border-wuipi-border">
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Descarga</th>
                  <th className="px-4 py-3">Subida</th>
                  <th className="px-4 py-3">Burst DL</th>
                  <th className="px-4 py-3">Burst UL</th>
                  <th className="px-4 py-3">Cong. Mgmt</th>
                </tr>
              </thead>
              <tbody>
                {policies.map(p => (
                  <tr key={p.name} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                    <td className="px-4 py-3 flex items-center gap-2">
                      <Shield size={14} className="text-wuipi-accent" />
                      <span className="font-medium text-white">{p.name}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.policy_id}</td>
                    <td className="px-4 py-3 text-gray-200">{formatRate(p.rate_dl)}</td>
                    <td className="px-4 py-3 text-gray-200">{formatRate(p.rate_ul)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {p.burst_rate_dl ? formatRate(p.burst_rate_dl) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {p.burst_rate_ul ? formatRate(p.burst_rate_ul) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.congestion_mgmt ? (
                        <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-xs">activo</span>
                      ) : (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
