"use client";

// Tab "Pagos Recibidos" — reemplaza el viejo /pagos. Lee collection_items
// con status='paid' (la fuente real de pagos confirmados) en vez de la
// tabla `payments` que estaba muerta.

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Search, DollarSign, TrendingUp, CreditCard,
  Calendar, CheckCircle2, Inbox,
} from "lucide-react";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";

interface PaymentRow {
  id: string;
  payment_token: string;
  customer_name: string;
  customer_cedula_rif: string;
  customer_phone: string | null;
  customer_email: string | null;
  invoice_number: string | null;
  amount_usd: number;
  amount_bss: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string;
  bcv_rate: number | null;
}

interface KPIs {
  today_usd: number;
  week_usd: number;
  month_usd: number;
  by_method: { method: string; count: number; amount_usd: number }[];
}

const METHOD_LABELS: Record<string, string> = {
  debito_inmediato: "Botón Web (Mercantil)",
  c2p: "Pago Móvil (C2P)",
  transferencia: "Transferencia",
  cash: "Efectivo (Oficina)",
  cash_usd: "Efectivo USD",
  stripe: "Tarjeta (Stripe)",
  paypal: "PayPal",
};

const METHOD_COLORS: Record<string, string> = {
  debito_inmediato: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  c2p: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  transferencia: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  cash: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  cash_usd: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  stripe: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  paypal: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
};

const fmtUSD = (n: number) =>
  `$${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentsReceivedTab() {
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (methodFilter !== "all") params.set("method", methodFilter);
      if (dateRange.from) params.set("from", dateRange.from);
      if (dateRange.to) params.set("to", dateRange.to);
      params.set("limit", "200");

      const res = await fetch(`/api/cobranzas/payments-received?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setItems(json.items || []);
        setKpis(json.kpis || null);
      }
    } catch (err) {
      console.error("[PaymentsReceived] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [search, methodFilter, dateRange.from, dateRange.to]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  useVisibilityPolling(fetchData, 60000); // refresh cada 1 min

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Pagos Recibidos</h3>
          <p className="text-sm text-gray-500">Cobros confirmados — fuente real desde collection_items</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="!p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Cobrado Hoy</span>
              <DollarSign size={16} className="text-emerald-400" />
            </div>
            <p className="text-xl font-bold text-white">{fmtUSD(kpis.today_usd)}</p>
          </Card>
          <Card className="!p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Cobrado Semana</span>
              <TrendingUp size={16} className="text-amber-400" />
            </div>
            <p className="text-xl font-bold text-white">{fmtUSD(kpis.week_usd)}</p>
          </Card>
          <Card className="!p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Cobrado Mes</span>
              <CreditCard size={16} className="text-violet-400" />
            </div>
            <p className="text-xl font-bold text-white">{fmtUSD(kpis.month_usd)}</p>
          </Card>
          <Card className="!p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Pagos en Vista</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <p className="text-xl font-bold text-white">{items.length}</p>
            <p className="text-[10px] text-gray-600 mt-1">en filtros aplicados</p>
          </Card>
        </div>
      )}

      {/* Breakdown por método */}
      {kpis && kpis.by_method.length > 0 && (
        <Card className="!p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Por método de pago</p>
          <div className="flex flex-wrap gap-2">
            {kpis.by_method.map(m => (
              <div
                key={m.method}
                className={`px-3 py-1.5 rounded-lg border text-xs ${METHOD_COLORS[m.method] || "text-gray-400 bg-gray-500/10 border-gray-500/20"}`}
              >
                <span className="font-semibold">{METHOD_LABELS[m.method] || m.method}</span>
                <span className="ml-2 text-gray-500">{m.count} · {fmtUSD(m.amount_usd)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros */}
      <Card className="!p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, RIF, referencia, factura..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-emerald-400/50 focus:outline-none"
            />
          </div>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
          >
            <option value="all">Todos los métodos</option>
            {Object.entries(METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-500" />
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(p => ({ ...p, from: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:outline-none"
            />
            <span className="text-gray-600">—</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(p => ({ ...p, to: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:outline-none"
            />
          </div>
        </div>
      </Card>

      {/* Sub-panel: pagos externos sin matchear */}
      <ExternalPaymentsPanel />

      {/* Tabla */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-3 pl-4 font-medium">Fecha</th>
                <th className="text-left p-3 font-medium">Cliente</th>
                <th className="text-left p-3 font-medium">Factura</th>
                <th className="text-center p-3 font-medium">Método</th>
                <th className="text-left p-3 font-medium">Referencia</th>
                <th className="text-right p-3 pr-4 font-medium">Monto USD</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                  <RefreshCw size={16} className="inline animate-spin mr-2" />Cargando...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                  No hay pagos en este rango de filtros
                </td></tr>
              ) : items.map(it => {
                const methodColor = METHOD_COLORS[it.payment_method || ""] || "text-gray-400 bg-gray-500/10 border-gray-500/20";
                return (
                  <tr key={it.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                    <td className="p-3 pl-4 text-xs text-gray-300 whitespace-nowrap">
                      {it.paid_at ? new Date(it.paid_at).toLocaleString("es-VE", {
                        day: "2-digit", month: "2-digit", year: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      }) : "—"}
                    </td>
                    <td className="p-3">
                      <p className="text-xs text-white font-medium truncate max-w-[200px]">{it.customer_name}</p>
                      <p className="text-[10px] text-gray-600 font-mono">{it.customer_cedula_rif}</p>
                    </td>
                    <td className="p-3 text-xs text-gray-400 font-mono">{it.invoice_number || "—"}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${methodColor}`}>
                        {METHOD_LABELS[it.payment_method || ""] || it.payment_method || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-300 font-mono truncate max-w-[160px]" title={it.payment_reference || ""}>
                      {it.payment_reference || "—"}
                    </td>
                    <td className="p-3 pr-4 text-right text-xs font-bold text-emerald-400">{fmtUSD(it.amount_usd)}</td>
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

// ──────────────────────────────────────────────────────────────────────────
// Sub-panel: pagos recibidos por el banco SIN factura asociada
// (PAGO MOVIL directos al número Wuipi, transferencias fuera del portal, etc).
// Solo visibilidad — el equipo de finanzas concilia manualmente en Odoo.
// ──────────────────────────────────────────────────────────────────────────

interface ExternalPaymentRow {
  id: string;
  received_at: string;
  payment_method: string | null;
  reference_number: string | null;
  amount: number | null;
  status: string | null;
}

interface ExternalStats {
  total_count: number;
  total_bs: number;
  by_method: Record<string, { count: number; totalBs: number }>;
  since: string;
}

function ExternalPaymentsPanel() {
  const [items, setItems] = useState<ExternalPaymentRow[]>([]);
  const [stats, setStats] = useState<ExternalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/cobranzas/external-payments?limit=100", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setItems(json.items || []);
        setStats(json.stats || null);
      }
    } catch (err) {
      console.error("[ExternalPayments] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useVisibilityPolling(fetchData, 60000);

  if (loading && !stats) return null;
  if (!stats || stats.total_count === 0) return null;

  return (
    <Card className="!p-0 overflow-hidden border-amber-500/30">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-3 flex items-center gap-3 hover:bg-amber-500/5 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Inbox size={18} className="text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Pagos externos sin matchear
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-400">
              {stats.total_count}
            </span>
          </p>
          <p className="text-xs text-gray-500">
            Pagos recibidos en el banco sin factura asociada — conciliar manualmente en Odoo
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-sm font-bold text-amber-400">
            Bs {Number(stats.total_bs).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <span className="text-gray-500 text-xs ml-2">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <>
          {/* Breakdown por método */}
          <div className="px-3 pb-3 border-t border-wuipi-border pt-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.by_method).map(([method, m]) => (
                <div
                  key={method}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs"
                >
                  <span className="font-semibold text-amber-300">{method}</span>
                  <span className="ml-2 text-gray-500">
                    {m.count} · Bs {Number(m.totalBs).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto border-t border-wuipi-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-wuipi-border bg-wuipi-bg/50">
                  <th className="text-left p-3 pl-4 font-medium">Fecha</th>
                  <th className="text-left p-3 font-medium">Método</th>
                  <th className="text-left p-3 font-medium">Referencia</th>
                  <th className="text-right p-3 pr-4 font-medium">Monto Bs</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-500 text-xs">
                    No hay pagos externos pendientes en los últimos 30 días
                  </td></tr>
                ) : items.map(it => (
                  <tr key={it.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                    <td className="p-3 pl-4 text-xs text-gray-300 whitespace-nowrap">
                      {new Date(it.received_at).toLocaleString("es-VE", {
                        day: "2-digit", month: "2-digit", year: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/20 bg-amber-500/5 text-amber-300">
                        {it.payment_method || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-300 font-mono truncate max-w-[180px]" title={it.reference_number || ""}>
                      {it.reference_number || "—"}
                    </td>
                    <td className="p-3 pr-4 text-right text-xs font-semibold text-amber-300">
                      {it.amount != null
                        ? Number(it.amount).toLocaleString("es-VE", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
