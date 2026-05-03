"use client";

// Tab "Logs Pasarelas" — observabilidad de cada operacion contra cada
// pasarela (mercantil, c2p, stripe, paypal, transferencia, cash). Lee
// payment_gateway_logs con filtros + KPIs.

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Search, Filter, AlertTriangle, CheckCircle2,
  Clock, X, TrendingUp,
} from "lucide-react";

interface LogRow {
  id: string;
  created_at: string;
  collection_item_id: string | null;
  payment_token: string | null;
  gateway: string;
  gateway_product: string | null;
  event_type: string;
  outcome: string | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  response_code: string | null;
  response_message: string | null;
  error_category: string | null;
  ip_address: string | null;
  duration_ms: number | null;
  customer_cedula_rif: string | null;
  customer_name: string | null;
  amount_usd: number | null;
  amount_ves: number | null;
}

interface KPIs {
  success_rate_24h: { gateway: string; total: number; success: number; rate: number }[];
  top_errors_7d: { category: string; count: number }[];
}

const OUTCOME_COLORS: Record<string, string> = {
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  error: "text-red-400 bg-red-500/10 border-red-500/20",
  pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  initiated: "Iniciado",
  request_sent: "Request",
  response_received: "Respuesta",
  webhook_received: "Webhook",
  success: "Éxito",
  error: "Error",
  timeout: "Timeout",
  abandoned: "Abandono",
};

const GATEWAY_LABELS: Record<string, string> = {
  mercantil: "Mercantil",
  c2p: "C2P",
  stripe: "Stripe",
  paypal: "PayPal",
  transferencia: "Transferencia",
  cash: "Cash",
};

const ERROR_CATEGORY_LABELS: Record<string, string> = {
  intra_bank_limit: "Límite intra-banco",
  insufficient_funds: "Fondos insuficientes",
  invalid_otp: "OTP inválido",
  invalid_credentials: "Credenciales",
  timeout: "Timeout",
  rate_limited: "Rate limit",
  gateway_5xx: "5xx Pasarela",
  unknown: "Desconocido",
};

export default function GatewayLogsTab() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [errorCategoryFilter, setErrorCategoryFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (gatewayFilter !== "all") params.set("gateway", gatewayFilter);
      if (outcomeFilter !== "all") params.set("outcome", outcomeFilter);
      if (errorCategoryFilter) params.set("error_category", errorCategoryFilter);
      params.set("limit", "300");

      const res = await fetch(`/api/cobranzas/gateway-logs?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setItems(json.items || []);
        setKpis(json.kpis || null);
      }
    } catch (err) {
      console.error("[GatewayLogs] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [search, gatewayFilter, outcomeFilter, errorCategoryFilter]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Logs de Pasarelas</h3>
          <p className="text-sm text-gray-500">
            Trazabilidad completa de cada intento de pago contra cada pasarela
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* KPIs: tasa exito 24h por gateway */}
      {kpis && kpis.success_rate_24h.length > 0 && (
        <Card className="!p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Tasa de éxito últimas 24h</p>
          <div className="flex flex-wrap gap-2">
            {kpis.success_rate_24h.map(g => {
              const color = g.rate >= 80 ? "text-emerald-400" : g.rate >= 50 ? "text-amber-400" : "text-red-400";
              return (
                <div key={g.gateway} className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-gray-300 font-medium">{GATEWAY_LABELS[g.gateway] || g.gateway}</span>
                    <span className={`font-bold ${color}`}>{g.rate}%</span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {g.success}/{g.total} eventos
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* KPIs: top errores 7 dias */}
      {kpis && kpis.top_errors_7d.length > 0 && (
        <Card className="!p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-400" />
            <p className="text-xs text-gray-500 uppercase tracking-wider">Top errores últimos 7 días</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {kpis.top_errors_7d.map(e => (
              <button
                key={e.category}
                onClick={() => setErrorCategoryFilter(errorCategoryFilter === e.category ? "" : e.category)}
                className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  errorCategoryFilter === e.category
                    ? "bg-red-500/20 border-red-500/40 text-red-300"
                    : "bg-wuipi-bg border-wuipi-border text-gray-300 hover:border-red-500/30"
                }`}
              >
                <span className="font-semibold">{ERROR_CATEGORY_LABELS[e.category] || e.category}</span>
                <span className="ml-2 text-gray-500">{e.count}</span>
              </button>
            ))}
            {errorCategoryFilter && (
              <button
                onClick={() => setErrorCategoryFilter("")}
                className="px-2 py-1.5 rounded-lg border border-wuipi-border text-gray-500 text-xs hover:text-white"
              >
                <X size={12} />
              </button>
            )}
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
              placeholder="Buscar token, cliente, código respuesta, mensaje..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-amber-400/50 focus:outline-none"
            />
          </div>
          <select
            value={gatewayFilter}
            onChange={(e) => setGatewayFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
          >
            <option value="all">Todas las pasarelas</option>
            {Object.entries(GATEWAY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
          >
            <option value="all">Todos los outcomes</option>
            <option value="success">Éxito</option>
            <option value="error">Error</option>
            <option value="pending">Pendiente</option>
          </select>
        </div>
      </Card>

      {/* Tabla */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-wuipi-card z-10">
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-2 pl-3 font-medium">Hora</th>
                <th className="text-left p-2 font-medium">Pasarela / Producto</th>
                <th className="text-left p-2 font-medium">Evento</th>
                <th className="text-center p-2 font-medium">Outcome</th>
                <th className="text-left p-2 font-medium">Cliente</th>
                <th className="text-left p-2 font-medium">Código</th>
                <th className="text-right p-2 pr-3 font-medium">ms</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                  <RefreshCw size={16} className="inline animate-spin mr-2" />Cargando...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                  No hay logs en estos filtros (puede que aún no haya tráfico real)
                </td></tr>
              ) : items.map(it => {
                const outcomeColor = it.outcome ? OUTCOME_COLORS[it.outcome] : "text-gray-400 bg-gray-500/10";
                return (
                  <tr
                    key={it.id}
                    onClick={() => setSelectedLog(it)}
                    className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover cursor-pointer"
                  >
                    <td className="p-2 pl-3 text-[10px] text-gray-400 font-mono whitespace-nowrap">
                      {new Date(it.created_at).toLocaleTimeString("es-VE", {
                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                      <p className="text-[9px] text-gray-600">
                        {new Date(it.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" })}
                      </p>
                    </td>
                    <td className="p-2 text-xs">
                      <p className="text-white font-medium">{GATEWAY_LABELS[it.gateway] || it.gateway}</p>
                      <p className="text-[10px] text-gray-500">{it.gateway_product || "—"}</p>
                    </td>
                    <td className="p-2 text-xs text-gray-300">{EVENT_TYPE_LABELS[it.event_type] || it.event_type}</td>
                    <td className="p-2 text-center">
                      {it.outcome && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${outcomeColor}`}>
                          {it.outcome === "success" ? <CheckCircle2 size={10} /> :
                           it.outcome === "error" ? <AlertTriangle size={10} /> :
                           <Clock size={10} />}
                          {it.outcome}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-gray-400 truncate max-w-[150px]">{it.customer_name || "—"}</td>
                    <td className="p-2 text-xs">
                      {it.response_code && (
                        <span className="font-mono text-amber-400">{it.response_code}</span>
                      )}
                      {it.error_category && (
                        <span className="ml-1 text-[10px] text-red-400">
                          {ERROR_CATEGORY_LABELS[it.error_category] || it.error_category}
                        </span>
                      )}
                    </td>
                    <td className="p-2 pr-3 text-right text-[10px] text-gray-500 font-mono">
                      {it.duration_ms ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de detalle */}
      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

// ============================================
// Modal de detalle
// ============================================
function LogDetailModal({ log, onClose }: { log: LogRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">Detalle del evento</h2>
            <p className="text-xs text-gray-500 font-mono">{log.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <Row label="Pasarela" value={`${GATEWAY_LABELS[log.gateway] || log.gateway} / ${log.gateway_product || "—"}`} />
          <Row label="Evento" value={`${EVENT_TYPE_LABELS[log.event_type] || log.event_type} (${log.outcome || "—"})`} />
          <Row label="Hora" value={new Date(log.created_at).toLocaleString("es-VE")} />
          <Row label="Duración" value={log.duration_ms != null ? `${log.duration_ms} ms` : "—"} />
          <Row label="Cliente" value={`${log.customer_name || "—"} (${log.customer_cedula_rif || "—"})`} />
          <Row label="Monto USD" value={log.amount_usd ? `$${log.amount_usd}` : "—"} />
          <Row label="Monto VES" value={log.amount_ves ? `Bs ${log.amount_ves}` : "—"} />
          <Row label="Token de pago" value={log.payment_token || "—"} mono />
          <Row label="IP" value={log.ip_address || "—"} mono />
          <Row label="Código respuesta" value={log.response_code || "—"} mono />
          <Row label="Mensaje" value={log.response_message || "—"} />
          {log.error_category && (
            <Row label="Categoría error" value={ERROR_CATEGORY_LABELS[log.error_category] || log.error_category} />
          )}

          {log.request_payload && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Request payload (whitelisted)</p>
              <pre className="bg-wuipi-bg border border-wuipi-border rounded-lg p-3 overflow-x-auto text-[10px] text-gray-300">
                {JSON.stringify(log.request_payload, null, 2)}
              </pre>
            </div>
          )}
          {log.response_payload && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Response payload (whitelisted)</p>
              <pre className="bg-wuipi-bg border border-wuipi-border rounded-lg p-3 overflow-x-auto text-[10px] text-gray-300">
                {JSON.stringify(log.response_payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-wuipi-border/30 pb-2">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-300 text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
