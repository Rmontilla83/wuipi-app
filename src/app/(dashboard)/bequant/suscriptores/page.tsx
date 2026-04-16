"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/topbar";
import { BequantSubNav } from "@/components/bequant/sub-nav";
import { Search, RefreshCw, Filter, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BequantSubscriberRow, BequantSubscriberGroupRow, BequantPolicyRow } from "@/types/bequant";

interface ListResponse {
  rows: BequantSubscriberRow[];
  total: number;
}

const PAGE_SIZE = 50;

export default function BequantSubscribersPage() {
  const [data, setData] = useState<ListResponse>({ rows: [], total: 0 });
  const [groups, setGroups] = useState<BequantSubscriberGroupRow[]>([]);
  const [policies, setPolicies] = useState<BequantPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("");
  const [policy, setPolicy] = useState<string>("");
  const [odooMatch, setOdooMatch] = useState<"all" | "yes" | "no">("all");
  const [page, setPage] = useState(0);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (search) params.set("q", search);
      if (group) params.set("group", group);
      if (policy) params.set("policy", policy);
      if (odooMatch !== "all") params.set("odooMatch", odooMatch);

      const res = await fetch(`/api/bequant/subscribers?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, group, policy, odooMatch]);

  useEffect(() => {
    fetch("/api/bequant/node", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (j?.groups) setGroups(j.groups); })
      .catch(() => {});
    fetch("/api/bequant/policies", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (Array.isArray(j)) setPolicies(j); })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(data.total / PAGE_SIZE);

  return (
    <>
      <TopBar
        title="Suscriptores Bequant"
        subtitle={`${data.total.toLocaleString("es-VE")} suscriptores sincronizados`}
        actions={
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-wuipi-card border border-wuipi-border rounded-lg hover:border-wuipi-accent disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
            Refrescar
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <BequantSubNav />

        <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar por IP o nombre cliente…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-10 pr-3 py-2 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white placeholder-gray-500 focus:border-wuipi-accent outline-none"
              />
            </div>
            <select
              value={group}
              onChange={e => { setGroup(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:border-wuipi-accent outline-none"
            >
              <option value="">Todos los grupos</option>
              {groups.map(g => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.client_count})
                </option>
              ))}
            </select>
            <select
              value={policy}
              onChange={e => { setPolicy(e.target.value); setPage(0); }}
              className="px-3 py-2 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:border-wuipi-accent outline-none"
            >
              <option value="">Todas las políticas</option>
              {policies.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name} ({(p.rate_dl / 1000).toFixed(0)}/{(p.rate_ul / 1000).toFixed(0)} Mbps)
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
            <Filter size={12} />
            <span>Match Odoo:</span>
            {(["all", "yes", "no"] as const).map(v => (
              <button
                key={v}
                onClick={() => { setOdooMatch(v); setPage(0); }}
                className={cn(
                  "px-2 py-1 rounded border",
                  odooMatch === v
                    ? "bg-wuipi-accent/10 border-wuipi-accent text-wuipi-accent"
                    : "border-wuipi-border text-gray-500 hover:text-gray-300"
                )}
              >
                {v === "all" ? "Todos" : v === "yes" ? "Vinculados" : "Sin cliente"}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-wuipi-card border border-wuipi-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-wuipi-accent animate-spin" />
            </div>
          ) : data.rows.length === 0 ? (
            <div className="p-10 text-center text-gray-500 text-sm">
              Sin resultados. Probá cambiar los filtros.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-wuipi-bg border-b border-wuipi-border">
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Cliente (Odoo)</th>
                  <th className="px-4 py-3">Plan / Servicio</th>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Torre</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(s => {
                  const mainGroup = s.subscriber_groups?.find(g => g !== "all-subscribers");
                  return (
                    <tr key={s.ip} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                      <td className="px-4 py-3 font-mono text-xs text-white">{s.ip}</td>
                      <td className="px-4 py-3">
                        {s.odoo_partner_id ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                            <span className="text-gray-200">{s.odoo_partner_name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-gray-500">
                            <XCircle size={14} className="shrink-0" />
                            <span className="text-xs">Sin vincular</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{s.odoo_product_name || "—"}</td>
                      <td className="px-4 py-3">
                        {s.policy_rate ? (
                          <span className="px-2 py-0.5 rounded bg-wuipi-accent/10 text-wuipi-accent text-xs">
                            {s.policy_rate}
                          </span>
                        ) : <span className="text-gray-500 text-xs">default</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{mainGroup || "—"}</td>
                      <td className="px-4 py-3">
                        {s.odoo_service_state ? (
                          <span className={cn(
                            "px-2 py-0.5 rounded text-xs",
                            s.odoo_service_state === "progress" && "bg-green-500/10 text-green-400",
                            s.odoo_service_state === "suspended" && "bg-yellow-500/10 text-yellow-400",
                            s.odoo_service_state === "draft" && "bg-gray-500/10 text-gray-400",
                          )}>
                            {s.odoo_service_state}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/bequant/suscriptores/${encodeURIComponent(s.ip)}`}
                          className="text-wuipi-accent hover:underline text-xs flex items-center gap-1"
                        >
                          Ver QoE <ExternalLink size={10} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Página {page + 1} de {totalPages} — {data.total.toLocaleString("es-VE")} totales
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-3 py-1 bg-wuipi-card border border-wuipi-border rounded disabled:opacity-50 hover:border-wuipi-accent"
              >
                Anterior
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 bg-wuipi-card border border-wuipi-border rounded disabled:opacity-50 hover:border-wuipi-accent"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
