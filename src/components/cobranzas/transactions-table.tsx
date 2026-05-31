"use client";

import { CheckCircle2, XCircle, Clock, AlertTriangle, Eye, Loader2, MinusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCaracas } from "@/lib/cobranzas/period-helpers";
import type { TxListItem, TxStatus, TxMethod, SyncStatus } from "@/lib/cobranzas/types";

const STATUS_STYLE: Record<TxStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  paid: { label: "Pagado", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  failed: { label: "Fallido", cls: "text-rose-400 bg-rose-500/10 border-rose-500/20", icon: XCircle },
  pending: { label: "Pendiente", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Clock },
  viewed: { label: "Visto", cls: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", icon: Eye },
  sent: { label: "Enviado", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: Clock },
  expired: { label: "Expirado", cls: "text-gray-400 bg-gray-500/10 border-gray-500/20", icon: MinusCircle },
  conciliating: { label: "Conciliando", cls: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: Loader2 },
};

const METHOD_STYLE: Record<TxMethod, { label: string; dot: string }> = {
  debito_inmediato: { label: "Mercantil Débito", dot: "bg-emerald-500" },
  c2p: { label: "C2P", dot: "bg-teal-500" },
  transferencia: { label: "Transferencia", dot: "bg-blue-500" },
  stripe: { label: "Stripe", dot: "bg-violet-500" },
  paypal: { label: "PayPal", dot: "bg-yellow-500" },
  cash: { label: "Efectivo", dot: "bg-gray-500" },
  pending: { label: "—", dot: "bg-gray-600" },
};

const SYNC_STYLE: Record<SyncStatus, { label: string; cls: string }> = {
  synced: { label: "Sincronizado", cls: "text-emerald-400 bg-emerald-500/10" },
  pending: { label: "En cola", cls: "text-amber-400 bg-amber-500/10" },
  retrying: { label: "Reintentando", cls: "text-amber-400 bg-amber-500/10" },
  manual_review: { label: "Revisión manual", cls: "text-rose-400 bg-rose-500/10" },
  cancelled: { label: "Cancelado", cls: "text-gray-400 bg-gray-500/10" },
  none: { label: "Sin cola", cls: "text-gray-500 bg-gray-500/10" },
};

const fmtUsd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtBs = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

export function TransactionsTable({
  rows,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
  onRowClick,
  activeId,
}: {
  rows: TxListItem[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (p: number) => void;
  onRowClick: (id: string) => void;
  activeId: string | null;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="bg-wuipi-card border border-wuipi-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-wuipi-bg/60 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Fecha</th>
              <th className="text-left px-4 py-3 font-medium">Cliente</th>
              <th className="text-left px-4 py-3 font-medium">Pasarela</th>
              <th className="text-right px-4 py-3 font-medium">Monto</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Factura</th>
              <th className="text-left px-4 py-3 font-medium">Sync Odoo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <Loader2 size={24} className="inline animate-spin text-wuipi-accent mr-2" />
                  Cargando transacciones…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  <AlertTriangle size={20} className="inline mr-2 text-gray-600" />
                  No hay transacciones que coincidan con estos filtros.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const status = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
              const method = METHOD_STYLE[r.payment_method] || METHOD_STYLE.pending;
              const sync = SYNC_STYLE[r.sync_status] || SYNC_STYLE.none;
              const Icon = status.icon;
              const isActive = activeId === r.id;
              const displayDate = r.paid_at || r.created_at;

              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r.id)}
                  className={cn(
                    "border-t border-wuipi-border cursor-pointer transition-colors",
                    isActive ? "bg-wuipi-accent/5" : "hover:bg-wuipi-card-hover",
                  )}
                >
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap font-mono text-xs">
                    {formatCaracas(displayDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white truncate max-w-[220px]">{r.customer_name || "—"}</div>
                    <div className="text-xs text-gray-500 font-mono">{r.customer_cedula_rif || ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-gray-300">
                      <span className={cn("w-2 h-2 rounded-full", method.dot)} />
                      {method.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="text-white font-semibold">{fmtUsd.format(r.amount_usd)}</div>
                    {r.amount_bss && r.amount_bss > 0 && (
                      <div className="text-xs text-gray-500">Bs. {fmtBs.format(r.amount_bss)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border",
                        status.cls,
                      )}
                    >
                      <Icon size={12} />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono truncate max-w-[140px]">
                    {r.invoice_number || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex text-xs px-2 py-1 rounded-md", sync.cls)}>
                      {sync.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="border-t border-wuipi-border px-4 py-2.5 flex items-center justify-between text-xs text-gray-500">
          <span>
            Página {page} de {totalPages} · {total} totales
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-wuipi-border text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-wuipi-border text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
