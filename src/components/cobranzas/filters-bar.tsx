"use client";

import { useState } from "react";
import { Search, X, Calendar, Filter, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TxMethod, TxStatus, SyncStatus } from "@/lib/cobranzas/types";

export type FiltersValue = {
  q: string;
  period: "hoy" | "7d" | "30d" | "mes" | "custom";
  customFrom: string;
  customTo: string;
  methods: TxMethod[];
  statuses: TxStatus[];
  syncStatuses: SyncStatus[];
};

export const DEFAULT_FILTERS: FiltersValue = {
  q: "",
  period: "7d",
  customFrom: "",
  customTo: "",
  methods: [],
  statuses: [],
  syncStatuses: [],
};

const PERIOD_OPTIONS: Array<{ value: FiltersValue["period"]; label: string }> = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "mes", label: "Mes" },
  { value: "custom", label: "Personalizado" },
];

const METHOD_OPTIONS: Array<{ value: TxMethod; label: string; color: string }> = [
  { value: "debito_inmediato", label: "Mercantil Débito", color: "bg-emerald-500" },
  { value: "c2p", label: "C2P", color: "bg-teal-500" },
  { value: "transferencia", label: "Transferencia P2P", color: "bg-blue-500" },
  { value: "stripe", label: "Stripe", color: "bg-violet-500" },
  { value: "paypal", label: "PayPal", color: "bg-yellow-500" },
  { value: "cash", label: "Efectivo", color: "bg-gray-500" },
];

const STATUS_OPTIONS: Array<{ value: TxStatus; label: string }> = [
  { value: "paid", label: "Pagado" },
  { value: "failed", label: "Fallido" },
  { value: "pending", label: "Pendiente" },
  { value: "viewed", label: "Visto" },
  { value: "sent", label: "Enviado" },
  { value: "expired", label: "Expirado" },
  { value: "conciliating", label: "Conciliando" },
];

const SYNC_OPTIONS: Array<{ value: SyncStatus; label: string }> = [
  { value: "synced", label: "Sincronizado" },
  { value: "pending", label: "En cola" },
  { value: "retrying", label: "Reintentando" },
  { value: "manual_review", label: "Revisión manual" },
  { value: "none", label: "Sin sincronizar" },
];

function ChipMulti<T extends string>({
  options,
  selected,
  onChange,
  colorOf,
}: {
  options: Array<{ value: T; label: string; color?: string }>;
  selected: T[];
  onChange: (next: T[]) => void;
  colorOf?: (v: T) => string;
}) {
  const toggle = (v: T) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            onClick={() => toggle(o.value)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition-colors",
              on
                ? "bg-wuipi-accent/15 border-wuipi-accent/50 text-white"
                : "bg-wuipi-bg border-wuipi-border text-gray-400 hover:text-white hover:border-gray-600",
            )}
          >
            {o.color || colorOf?.(o.value) ? (
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1.5", o.color || colorOf?.(o.value))} />
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FiltersBar({
  value,
  onChange,
  onExport,
  isLoading,
  resultCount,
}: {
  value: FiltersValue;
  onChange: (next: FiltersValue) => void;
  onExport: () => void;
  isLoading: boolean;
  resultCount: number;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeFilterCount =
    value.methods.length + value.statuses.length + value.syncStatuses.length;

  const clear = (k: keyof FiltersValue) => {
    onChange({ ...value, [k]: Array.isArray(value[k]) ? [] : "" });
  };

  return (
    <div className="bg-wuipi-card border border-wuipi-border rounded-2xl overflow-hidden">
      <div className="p-3 sm:p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            placeholder="Buscar cliente, cédula, factura o ref. del banco…"
            className="w-full pl-9 pr-9 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-xl text-sm text-white placeholder:text-gray-600 outline-none focus:border-wuipi-accent"
          />
          {value.q && (
            <button
              onClick={() => clear("q")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition-colors",
              showAdvanced || activeFilterCount > 0
                ? "bg-wuipi-accent/15 border-wuipi-accent/50 text-white"
                : "bg-wuipi-bg border-wuipi-border text-gray-400 hover:text-white",
            )}
          >
            <Filter size={14} />
            Filtros
            {activeFilterCount > 0 && (
              <span className="text-xs bg-wuipi-accent/30 text-white rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            onClick={onExport}
            disabled={isLoading || resultCount === 0}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border border-wuipi-border bg-wuipi-bg text-gray-400 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Descargar CSV con los filtros activos"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-3 flex items-center gap-2 overflow-x-auto">
        <Calendar size={14} className="text-gray-500 shrink-0" />
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange({ ...value, period: p.value })}
            className={cn(
              "shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors",
              value.period === p.value
                ? "bg-wuipi-accent/15 border-wuipi-accent/50 text-white"
                : "bg-wuipi-bg border-wuipi-border text-gray-400 hover:text-white",
            )}
          >
            {p.label}
          </button>
        ))}
        {value.period === "custom" && (
          <div className="flex items-center gap-2 ml-2 shrink-0">
            <input
              type="date"
              value={value.customFrom}
              onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
              className="text-xs px-2 py-1.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-gray-300"
            />
            <span className="text-gray-600 text-xs">→</span>
            <input
              type="date"
              value={value.customTo}
              onChange={(e) => onChange({ ...value, customTo: e.target.value })}
              className="text-xs px-2 py-1.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-gray-300"
            />
          </div>
        )}
      </div>

      {showAdvanced && (
        <div className="border-t border-wuipi-border bg-wuipi-bg/40 px-3 sm:px-4 py-3 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Pasarela</p>
            <ChipMulti
              options={METHOD_OPTIONS}
              selected={value.methods}
              onChange={(next) => onChange({ ...value, methods: next })}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Estado del pago</p>
            <ChipMulti
              options={STATUS_OPTIONS}
              selected={value.statuses}
              onChange={(next) => onChange({ ...value, statuses: next })}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Sync Odoo</p>
            <ChipMulti
              options={SYNC_OPTIONS}
              selected={value.syncStatuses}
              onChange={(next) => onChange({ ...value, syncStatuses: next })}
            />
          </div>
        </div>
      )}

      <div className="border-t border-wuipi-border px-3 sm:px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <span>
          {isLoading ? "Buscando…" : `${resultCount} ${resultCount === 1 ? "transacción" : "transacciones"}`}
        </span>
        {(activeFilterCount > 0 || value.q) && (
          <button
            onClick={() =>
              onChange({ ...DEFAULT_FILTERS, period: value.period, customFrom: value.customFrom, customTo: value.customTo })
            }
            className="text-gray-500 hover:text-white"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
