"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, AlertTriangle, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Kpis } from "@/lib/cobranzas/types";
import { cn } from "@/lib/utils";

export type KpiPreset = "cobrado" | "fallidos" | "pendientes";

function pctDelta(curr: number, prev: number): { value: number; label: string } | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { value: 100, label: "+100%" };
  const diff = ((curr - prev) / prev) * 100;
  if (Math.abs(diff) < 0.1) return { value: 0, label: "0%" };
  return { value: diff, label: `${diff > 0 ? "+" : ""}${diff.toFixed(0)}%` };
}

function DeltaPill({ delta }: { delta: { value: number; label: string } | null }) {
  if (!delta) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Minus size={11} /> sin comparativa
      </span>
    );
  }
  const up = delta.value > 0;
  const flat = delta.value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        flat && "text-gray-500",
        !flat && up && "text-emerald-400",
        !flat && !up && "text-rose-400",
      )}
    >
      {flat ? <Minus size={11} /> : up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {delta.label}
    </span>
  );
}

const fmtUsd = new Intl.NumberFormat("es-VE", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const fmtBs = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

export function KpiRow({
  period,
  from,
  to,
  onPreset,
  activePreset,
}: {
  period: string;
  from?: string;
  to?: string;
  onPreset?: (preset: KpiPreset) => void;
  activePreset?: KpiPreset | null;
}) {
  const queryKey = ["cobranzas-kpis", period, from, to];

  const { data, isLoading, isError } = useQuery<Kpis>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/cobranzas/panel/kpis?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="!p-4">
            <div className="animate-pulse">
              <div className="h-3 bg-wuipi-border rounded w-24 mb-3" />
              <div className="h-6 bg-wuipi-border rounded w-32 mb-2" />
              <div className="h-3 bg-wuipi-border rounded w-20" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="!p-4 border-red-500/30 bg-red-500/5">
        <p className="text-sm text-red-400">No se pudieron cargar los indicadores.</p>
      </Card>
    );
  }

  const cobradoDelta = pctDelta(data.cobradoUsd, data.cobradoUsdPrev);
  const successDelta = pctDelta(data.successRate, data.successRatePrev);

  // Wrapper que hace el card clickeable solo si onPreset existe.
  // El ring/active styling marca cuál preset está aplicado actualmente.
  const renderCard = (
    preset: KpiPreset | null,
    ringColor: string,
    children: React.ReactNode,
  ) => {
    const clickable = !!preset && !!onPreset;
    const active = !!preset && activePreset === preset;
    return (
      <Card
        className={cn(
          "!p-4 transition-all",
          clickable && "cursor-pointer hover:border-wuipi-accent/40 hover:bg-wuipi-card-hover",
          active && `ring-1 ${ringColor} border-wuipi-accent/30 bg-wuipi-card-hover`,
        )}
        onClick={clickable ? () => onPreset!(preset!) : undefined}
      >
        {children}
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {renderCard(
        "cobrado",
        "ring-emerald-500/30",
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <DollarSign size={18} className="text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">
              Cobrado en el período{onPreset && <span className="ml-1 text-gray-600">· ver</span>}
            </p>
            <p className="text-xl font-bold text-white truncate">{fmtUsd.format(data.cobradoUsd)}</p>
            <div className="flex items-center gap-2 mt-1">
              <DeltaPill delta={cobradoDelta} />
              {data.cobradoBss > 0 && (
                <span className="text-xs text-gray-600">· Bs. {fmtBs.format(data.cobradoBss)}</span>
              )}
            </div>
          </div>
        </div>,
      )}

      {renderCard(
        null,
        "",
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-cyan-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">Tasa de éxito</p>
            <p className="text-xl font-bold text-white">{data.successRate.toFixed(1)}%</p>
            <div className="mt-1">
              <DeltaPill delta={successDelta} />
            </div>
          </div>
        </div>,
      )}

      {renderCard(
        "fallidos",
        "ring-rose-500/30",
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
            <XCircle size={18} className="text-rose-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">
              Intentos fallidos{onPreset && <span className="ml-1 text-gray-600">· ver</span>}
            </p>
            <p className="text-xl font-bold text-white">{data.failedCount}</p>
            <p className="text-xs text-gray-600 mt-1 truncate">
              {data.failedTopReason ? `Top: ${data.failedTopReason}` : "Sin fallos en el período"}
            </p>
          </div>
        </div>,
      )}

      {renderCard(
        "pendientes",
        "ring-amber-500/30",
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500">
              Pendientes / colgados{onPreset && <span className="ml-1 text-gray-600">· ver</span>}
            </p>
            <p className="text-xl font-bold text-white">{data.pendingCount}</p>
            <p className="text-xs text-gray-600 mt-1">Sync Odoo en revisión manual + huérfanos</p>
          </div>
        </div>,
      )}
    </div>
  );
}
