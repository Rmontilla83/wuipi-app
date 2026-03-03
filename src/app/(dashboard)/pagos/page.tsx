"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  TrendingUp,
  Loader2,
} from "lucide-react";

// --- Types ---

interface PaymentRecord {
  id: string;
  payment_number: string;
  payment_token: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method_name: string | null;
  reference_number: string | null;
  customer_email: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  invoice_id: string | null;
}

interface PaymentStats {
  today: number;
  week: number;
  month: number;
  pending_count: number;
  approved_count: number;
  total_count: number;
}

// --- Component ---

export default function PagosPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  const fetchPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/facturacion/payments?${params.toString()}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setPayments(data);
      } else if (data.data) {
        setPayments(data.data);
      }
    } catch (err) {
      console.error("Error fetching payments:", err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Compute stats from payments
  useEffect(() => {
    if (!payments.length) {
      setStats({ today: 0, week: 0, month: 0, pending_count: 0, approved_count: 0, total_count: 0 });
      return;
    }
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const confirmed = payments.filter((p) => p.status === "confirmed");

    setStats({
      today: confirmed
        .filter((p) => new Date(p.created_at) >= todayStart)
        .reduce((sum, p) => sum + Number(p.amount), 0),
      week: confirmed
        .filter((p) => new Date(p.created_at) >= weekStart)
        .reduce((sum, p) => sum + Number(p.amount), 0),
      month: confirmed
        .filter((p) => new Date(p.created_at) >= monthStart)
        .reduce((sum, p) => sum + Number(p.amount), 0),
      pending_count: payments.filter((p) => p.status === "pending").length,
      approved_count: confirmed.length,
      total_count: payments.length,
    });
  }, [payments]);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/mercantil/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_from: dateRange.from,
          date_to: dateRange.to,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(
          `Conciliación completada:\n` +
          `Total: ${data.total_transactions} transacciones\n` +
          `Coincidentes: ${data.matched}\n` +
          `Sin coincidencia: ${data.unmatched}`
        );
        fetchPayments();
      } else {
        alert(data.error || "Error en conciliación");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setReconciling(false);
    }
  };

  const formatCurrency = (amount: number, currency = "VES") => {
    const prefix = currency === "VES" ? "Bs. " : "$ ";
    return prefix + Number(amount).toLocaleString("es-VE", { minimumFractionDigits: 2 });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
      pending: {
        label: "Pendiente",
        color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
        icon: <Clock className="w-3 h-3" />,
      },
      confirmed: {
        label: "Aprobado",
        color: "bg-green-500/10 text-green-400 border-green-500/20",
        icon: <CheckCircle2 className="w-3 h-3" />,
      },
      rejected: {
        label: "Rechazado",
        color: "bg-red-500/10 text-red-400 border-red-500/20",
        icon: <XCircle className="w-3 h-3" />,
      },
    };
    const s = map[status] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
        {s.icon} {s.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pagos Mercantil</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pasarela de pagos — Banco Mercantil
          </p>
        </div>
        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent/10 text-wuipi-accent
                     border border-wuipi-accent/20 hover:bg-wuipi-accent/20 transition-colors text-sm font-medium
                     disabled:opacity-50"
        >
          {reconciling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Conciliar
        </button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Cobrado Hoy"
            value={formatCurrency(stats.today)}
            icon={<ArrowUpRight className="w-5 h-5 text-green-400" />}
          />
          <KPICard
            label="Cobrado Semana"
            value={formatCurrency(stats.week)}
            icon={<TrendingUp className="w-5 h-5 text-wuipi-accent" />}
          />
          <KPICard
            label="Cobrado Mes"
            value={formatCurrency(stats.month)}
            icon={<CreditCard className="w-5 h-5 text-wuipi-purple" />}
          />
          <KPICard
            label="Pendientes"
            value={String(stats.pending_count)}
            subtitle={`${stats.approved_count} aprobados de ${stats.total_count}`}
            icon={<Clock className="w-5 h-5 text-yellow-400" />}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por referencia, email, token..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-wuipi-card border border-wuipi-border
                       text-white text-sm placeholder-gray-600 focus:outline-none focus:border-wuipi-accent/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-card border border-wuipi-border
                       text-white text-sm focus:outline-none focus:border-wuipi-accent/50"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="confirmed">Aprobados</option>
            <option value="rejected">Rechazados</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-wuipi-card border border-wuipi-border text-white text-sm"
          />
          <span className="text-gray-500">—</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))}
            className="px-3 py-2 rounded-lg bg-wuipi-card border border-wuipi-border text-white text-sm"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-wuipi-card rounded-xl border border-wuipi-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wuipi-border">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Referencia</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Método</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Monto</th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-wuipi-accent mx-auto" />
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No hay transacciones para mostrar
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString("es-VE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-mono text-xs">
                        {p.reference_number || p.payment_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {p.payment_method_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white font-semibold">
                        {formatCurrency(p.amount, p.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{getStatusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[150px]">
                      {p.customer_email || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- KPI Card ---

function KPICard({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-wuipi-card rounded-xl border border-wuipi-border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}
