"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KpiRow, type KpiPreset } from "@/components/cobranzas/kpi-row";
import { FiltersBar, DEFAULT_FILTERS, type FiltersValue } from "@/components/cobranzas/filters-bar";
import { TransactionsTable } from "@/components/cobranzas/transactions-table";
import { DetailDrawer } from "@/components/cobranzas/detail-drawer";
import type { TxListResponse } from "@/lib/cobranzas/types";

/**
 * Aplica un preset de filtros al hacer click en un KPI card. La idea es
 * "click → ver justo de qué se trata ese número del KPI". Por eso LIMPIA la
 * búsqueda de texto y los filtros de pasarela: el KPI cuenta el total del
 * período, así que la tabla debe mostrar ese mismo total, no un subconjunto
 * de una búsqueda previa. Mantiene el período (los KPIs son de ese período).
 */
function applyPreset(current: FiltersValue, preset: KpiPreset): FiltersValue {
  const cleared: FiltersValue = { ...current, q: "", methods: [], statuses: [], syncStatuses: [] };
  if (preset === "cobrado") {
    return { ...cleared, statuses: ["paid"] };
  }
  if (preset === "fallidos") {
    return { ...cleared, statuses: ["failed"] };
  }
  // pendientes / colgados: paid con sync manual_review o sin cola. El KPI los
  // cuenta en ventana de 90 días (huérfanos) + manual_review, así que usamos
  // período custom de 90d para que la tabla muestre los mismos que el KPI.
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return {
    ...cleared,
    statuses: ["paid"],
    syncStatuses: ["manual_review", "none"],
    period: "custom",
    customFrom: from.toISOString().slice(0, 10),
    customTo: to.toISOString().slice(0, 10),
  };
}

function detectActivePreset(f: FiltersValue): KpiPreset | null {
  const s = f.statuses.join(",");
  const y = f.syncStatuses.join(",");
  if (s === "paid" && y === "manual_review,none") return "pendientes";
  if (s === "paid" && y === "") return "cobrado";
  if (s === "failed" && y === "") return "fallidos";
  return null;
}

function buildSearchParams(filters: FiltersValue, page: number, pageSize: number): URLSearchParams {
  const p = new URLSearchParams();
  p.set("period", filters.period);
  if (filters.period === "custom") {
    if (filters.customFrom) p.set("from", filters.customFrom);
    if (filters.customTo) p.set("to", filters.customTo);
  }
  if (filters.q.trim()) p.set("q", filters.q.trim());
  for (const m of filters.methods) p.append("method", m);
  for (const s of filters.statuses) p.append("status", s);
  for (const s of filters.syncStatuses) p.append("sync", s);
  p.set("page", String(page));
  p.set("pageSize", String(pageSize));
  return p;
}

export function TransaccionesView() {
  const [filters, setFilters] = useState<FiltersValue>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [openId, setOpenId] = useState<string | null>(null);

  const params = useMemo(
    () => buildSearchParams(filters, page, pageSize).toString(),
    [filters, page],
  );

  const { data, isLoading, isFetching } = useQuery<TxListResponse>({
    queryKey: ["cobranzas-tx-list", params],
    queryFn: async () => {
      const res = await fetch(`/api/cobranzas/panel/transactions?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const onFiltersChange = (next: FiltersValue) => {
    setFilters(next);
    setPage(1);
  };

  const onKpiPreset = (preset: KpiPreset) => {
    // Si ya está activo el mismo preset, desactivar (toggle).
    if (detectActivePreset(filters) === preset) {
      setFilters({ ...filters, statuses: [], syncStatuses: [] });
    } else {
      setFilters(applyPreset(filters, preset));
    }
    setPage(1);
  };

  const activePreset = detectActivePreset(filters);

  const handleExport = () => {
    const exportParams = buildSearchParams(filters, 1, 5000);
    exportParams.delete("page");
    exportParams.delete("pageSize");
    window.location.href = `/api/cobranzas/panel/transactions/export?${exportParams.toString()}`;
  };

  return (
    <div className="space-y-4">
      <KpiRow
        period={filters.period}
        from={filters.period === "custom" ? filters.customFrom : undefined}
        to={filters.period === "custom" ? filters.customTo : undefined}
        onPreset={onKpiPreset}
        activePreset={activePreset}
      />

      <FiltersBar
        value={filters}
        onChange={onFiltersChange}
        onExport={handleExport}
        isLoading={isFetching}
        resultCount={data?.total ?? 0}
      />

      <TransactionsTable
        rows={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        isLoading={isLoading}
        onPageChange={setPage}
        onRowClick={setOpenId}
        activeId={openId}
      />

      <DetailDrawer txId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
