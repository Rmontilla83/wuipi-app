"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Users, Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
} from "lucide-react";
import type { OdooClient } from "@/types/odoo";

const fmtUSD = (n: number) =>
  `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_FILTERS = [
  { value: "", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "paused", label: "Pausados" },
  { value: "no_service", label: "Sin servicio" },
  { value: "debt", label: "Con deuda" },
];

function ServiceStatusBadge({ c }: { c: OdooClient }) {
  if (c.service_count === 0) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-gray-400 bg-gray-400/10">Sin servicio</span>;
  }
  if (c.services_suspended === 0) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-400 bg-emerald-400/10">{c.services_active} activo{c.services_active !== 1 ? "s" : ""}</span>;
  }
  if (c.services_active === 0) {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-red-400 bg-red-400/10">{c.services_suspended} suspendido{c.services_suspended !== 1 ? "s" : ""}</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-400 bg-emerald-400/10">{c.services_active} activo{c.services_active !== 1 ? "s" : ""}</span>
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium text-red-400 bg-red-400/10">{c.services_suspended} susp.</span>
    </div>
  );
}

export default function ClientesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const { data: queryData, isLoading: loading, refetch } = useQuery({
    queryKey: ["odoo-clients", debouncedSearch, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", "50");
      const res = await fetch(`/api/odoo/clients?${params}`);
      if (!res.ok) throw new Error("Error al cargar clientes");
      return res.json();
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const clients: OdooClient[] = queryData?.clients || [];
  const total: number = queryData?.total || 0;

  const totalPages = Math.ceil(total / 50);

  return (
    <>
      <TopBar title="Clientes" subtitle={`${total.toLocaleString()} clientes en Odoo`} />
      <div className="p-4 md:p-6 space-y-4">

        {/* Filters */}
        <Card className="!p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, RIF, email, teléfono..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none px-3 py-2 pr-8 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-wuipi-accent/50 focus:outline-none"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
            <button
              onClick={() => refetch()}
              disabled={loading}
              className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <span className="text-xs text-gray-500 ml-auto">
              {total.toLocaleString()} resultado{total !== 1 ? "s" : ""}
            </span>
          </div>
        </Card>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-gray-500" />
            <span className="ml-3 text-gray-500 text-sm">Consultando Odoo...</span>
          </div>
        ) : clients.length === 0 ? (
          <Card className="text-center py-12">
            <Users size={32} className="mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 text-sm">No se encontraron clientes</p>
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-280px)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-wuipi-card z-10">
                  <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                    <th className="text-left p-3 font-medium">Cliente</th>
                    <th className="text-left p-3 font-medium">Contacto</th>
                    <th className="text-left p-3 font-medium">Ciudad</th>
                    <th className="text-left p-3 font-medium">Servicios</th>
                    <th className="text-right p-3 font-medium">MRR</th>
                    <th className="text-right p-3 font-medium">Saldo</th>
                    <th className="text-center p-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/clientes/${c.id}`)}
                        className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover cursor-pointer transition-colors"
                      >
                        <td className="p-3">
                          <p className="text-white text-xs font-medium">{c.name}</p>
                          <p className="text-gray-500 text-[10px] font-mono">
                            {c.identification_type ? `${c.identification_type} ` : ""}{c.vat}
                          </p>
                        </td>
                        <td className="p-3">
                          <p className="text-gray-300 text-xs">{c.mobile || c.phone || "—"}</p>
                          <p className="text-gray-600 text-[10px] truncate max-w-[160px]">{c.email || ""}</p>
                        </td>
                        <td className="p-3 text-gray-400 text-xs">{c.city}{c.state ? `, ${c.state}` : ""}</td>
                        <td className="p-3">
                          <p className="text-white text-xs">{c.service_count} servicio{c.service_count !== 1 ? "s" : ""}</p>
                          <p className="text-gray-600 text-[10px] truncate max-w-[180px]">
                            {c.main_plans.length > 0 ? c.main_plans.slice(0, 3).join(", ") : "—"}
                          </p>
                        </td>
                        <td className="p-3 text-right text-cyan-400 text-xs font-medium">
                          {c.mrr_usd > 0 ? fmtUSD(c.mrr_usd) : "—"}
                        </td>
                        <td className="p-3 text-right">
                          {c.credit > 0 ? (
                            <span className="text-red-400 text-xs font-medium">
                              {c.credit.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">0.00</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <ServiceStatusBadge c={c} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Página {page} de {totalPages} ({total.toLocaleString()} clientes)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
