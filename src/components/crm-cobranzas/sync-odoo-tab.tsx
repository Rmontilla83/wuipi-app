"use client";

// Tab "Sync Odoo" — items pendientes de sincronizacion con Odoo
// (odoo_sync_queue). Reemplaza el page standalone /cobranzas/odoo-pendientes.

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { RefreshCw, RotateCw, CheckCircle2, XCircle, AlertCircle, Clock, Loader2 } from "lucide-react";

interface QueueItem {
  id: string;
  collection_item_id: string;
  odoo_invoice_id: number | null;
  odoo_partner_id: number | null;
  payment_method: string;
  payment_token: string;
  payment_reference: string | null;
  amount_usd: number | null;
  amount_ves: number | null;
  attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  post_invoice_done: boolean;
  register_payment_done: boolean;
  status: "pending" | "retrying" | "manual_review" | "done" | "cancelled";
  resolved_manually: boolean;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:       { label: "Pendiente",     color: "text-blue-400 bg-blue-500/10 border-blue-500/30",       icon: Clock },
  retrying:      { label: "Reintentando",  color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", icon: RotateCw },
  manual_review: { label: "Review manual", color: "text-red-400 bg-red-500/10 border-red-500/30",         icon: AlertCircle },
  done:          { label: "Done",          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  cancelled:     { label: "Cancelado",     color: "text-gray-400 bg-gray-500/10 border-gray-500/30",       icon: XCircle },
};

const STATUS_FILTERS: { id: string; label: string; statuses: string }[] = [
  { id: "active", label: "Activos",        statuses: "pending,retrying,manual_review" },
  { id: "manual", label: "Review manual",  statuses: "manual_review" },
  { id: "all",    label: "Todos",          statuses: "" },
  { id: "done",   label: "Resueltos",      statuses: "done,cancelled" },
];

export default function SyncOdooTab() {
  const [filter, setFilter] = useState("active");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const f = STATUS_FILTERS.find((x) => x.id === filter);
      const qs = f?.statuses ? `?status=${f.statuses}&limit=100` : "?limit=100";
      const res = await fetch(`/api/admin/odoo/queue${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error cargando");
      setItems(json.items || []);
      setTotal(json.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (id: string) => {
    setActionLoading(id + "-retry");
    try {
      const res = await fetch(`/api/admin/odoo/queue/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error");
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al reintentar");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (id: string, action: "resolve" | "cancel") => {
    const notes = prompt(
      action === "resolve"
        ? "Notas (opcional) — describe cómo resolviste el item manualmente:"
        : "Notas (opcional) — razón de la cancelación:"
    );
    if (notes === null) return;
    setActionLoading(id + "-resolve");
    try {
      const res = await fetch(`/api/admin/odoo/queue/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notes || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error");
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Cola Sync Odoo</h3>
          <p className="text-sm text-gray-500">Items pendientes de sincronización con Odoo</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              filter === f.id
                ? "border-[#F46800] bg-[#F46800]/10 text-[#F46800]"
                : "border-wuipi-border text-gray-400 hover:text-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">
          {loading ? "Cargando…" : `${items.length} mostrados (de ${total} totales)`}
        </span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Tabla */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 border-b border-wuipi-border">
              <tr>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Token</th>
                <th className="px-3 py-2.5">Factura Odoo</th>
                <th className="px-3 py-2.5">Método</th>
                <th className="px-3 py-2.5 text-right">Monto</th>
                <th className="px-3 py-2.5 text-center">Intentos</th>
                <th className="px-3 py-2.5">Próximo</th>
                <th className="px-3 py-2.5">Último error</th>
                <th className="px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">No hay items</td></tr>
              ) : items.map((item) => {
                const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.pending;
                const Icon = statusInfo.icon;
                const isProcessing = actionLoading?.startsWith(item.id);
                return (
                  <tr key={item.id} className="border-b border-wuipi-border/50 last:border-0 hover:bg-wuipi-card-hover">
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${statusInfo.color}`}>
                        <Icon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-300 font-mono text-xs">{item.payment_token}</td>
                    <td className="px-3 py-2.5 text-gray-400">
                      {item.odoo_invoice_id || "-"}
                      {item.post_invoice_done && <span className="text-emerald-400 ml-1" title="Factura ya posted">✓</span>}
                      {item.register_payment_done && <span className="text-emerald-400 ml-1" title="Payment ya registrado">✓</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{item.payment_method}</td>
                    <td className="px-3 py-2.5 text-right text-gray-300">
                      {item.amount_ves ? `${item.amount_ves} Bs` : item.amount_usd ? `$${item.amount_usd}` : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-400">{item.attempts}/5</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">
                      {new Date(item.next_attempt_at).toLocaleString("es-VE", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                      })}
                    </td>
                    <td className="px-3 py-2.5 text-red-300 text-xs max-w-xs truncate" title={item.last_error || ""}>
                      {item.last_error?.slice(0, 60) || "-"}
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-1">
                      {(item.status === "pending" || item.status === "retrying" || item.status === "manual_review") && (
                        <>
                          <button
                            onClick={() => handleRetry(item.id)}
                            disabled={isProcessing}
                            className="px-2 py-1 rounded text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 disabled:opacity-50"
                          >
                            Reintentar
                          </button>
                          <button
                            onClick={() => handleResolve(item.id, "resolve")}
                            disabled={isProcessing}
                            className="px-2 py-1 rounded text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 disabled:opacity-50"
                          >
                            Resuelto
                          </button>
                          <button
                            onClick={() => handleResolve(item.id, "cancel")}
                            disabled={isProcessing}
                            className="px-2 py-1 rounded text-xs bg-gray-500/10 hover:bg-gray-500/20 border border-gray-500/30 text-gray-400 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
