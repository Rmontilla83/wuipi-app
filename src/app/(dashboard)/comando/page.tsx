"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { KPICard } from "@/components/ui/kpi-card";
import {
  ZabbixBanner, AlertBanner, ProblemasActivos,
} from "@/components/comando/infra";
import type { InfraOverview, InfraProblem, InfraHost } from "@/types/zabbix";
import type { MikrotikNode } from "@/types/odoo";
import {
  Target, DollarSign, Headphones, TrendingUp,
  RefreshCw, AlertTriangle, Clock,
  Activity, Zap, Server, Wifi, Shield,
  CreditCard, BarChart3, UserPlus, Users,
  ArrowUpRight, ArrowDownRight, Minus,
  Bell, ChevronRight, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ============================================
// TYPES
// ============================================
type Tab = "finanzas" | "operaciones" | "crecimiento";

interface AgingBucket { count: number; total: number }
interface TopDebtor { partner_id: number; name: string; total_due: number; invoice_count: number; oldest_due_date: string; currency: string }
interface PlanCategory { category: string; total: number; active: number; paused: number; plans: { code: string; name: string; active: number; paused: number; total: number }[] }
interface MonthlyHistoryEntry { month: string; label: string; drafted_usd: number; collected_usd: number; effectiveness: number }
interface JournalPayment { journal_id: number; journal_name: string; count: number; total: number; currency: string }

interface FinanceStats {
  invoiced_ved: number; collected_ved: number; invoices_count_ved: number; collection_rate_ved: number;
  invoiced_usd: number; collected_usd: number; invoices_count_usd: number; collection_rate_usd: number;
  overdue_count: number; overdue_total_ved: number; overdue_total_usd: number;
  active_subscriptions: number; paused_subscriptions: number; mrr_usd: number;
  aging: { bucket_0_15: AgingBucket; bucket_16_30: AgingBucket; bucket_31_60: AgingBucket; bucket_60_plus: AgingBucket };
  top_debtors: TopDebtor[];
  plan_distribution: PlanCategory[];
  total_services: number; active_services: number; paused_services: number;
  exchange_rate: number | null;
  monthly_history?: MonthlyHistoryEntry[];
  payments_by_journal?: JournalPayment[];
  prev_collected_ved?: number; prev_collected_usd?: number; prev_invoiced_ved?: number;
}

interface TicketStats {
  total: number; open: number; in_progress: number; resolved_today: number;
  resolved_this_month: number; sla_breached: number; critical_active: number; active: number;
  avg_resolution_hours: number;
  by_category: { id: string; name: string; color: string; count: number }[];
  by_assigned: { id: string; name: string; count: number }[];
}

interface SoporteData {
  total_leads: number; tickets_open: number; tickets_in_progress: number;
  tickets_pending: number; tickets_resolved_today: number; active_tickets: number;
  by_category: { category: string; label: string; count: number; percentage: number }[];
  by_technician: { id: string; name: string; tickets_total: number; tickets_resolved: number; tickets_open: number; sla_compliance: number }[];
}

interface VentasStats {
  total: number; active: number; won: number; lost: number;
  pipeline_value: number; conversion_rate: number;
  created_this_week: number; created_this_month: number; won_this_month: number;
  by_stage: Record<string, { count: number; value: number }>;
}

interface CobranzasStats {
  total: number; active: number; recovered: number; retired: number;
  recovery_rate: number; active_amount: number;
  by_stage: Record<string, { count: number; amount: number }>;
}

// ============================================
// HELPERS
// ============================================
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = (n: number) => `$${fmt(n)}`;
const fmtBs = (n: number) => `Bs ${fmt(n)}`;
const fmtShort = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0);

function DeltaBadge({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (!previous || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><Minus size={10} /> 0%</span>;
  const positive = pct > 0;
  return (
    <span className={`text-[10px] flex items-center gap-0.5 ${positive ? "text-emerald-400" : "text-red-400"}`}>
      {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {positive ? "+" : ""}{pct}%{suffix}
    </span>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ============================================
// TAB BUTTON
// ============================================
function TabButton({ tab, current, icon: Icon, label, color, onClick }: {
  tab: Tab; current: Tab; icon: any; label: string; color: string; onClick: (t: Tab) => void;
}) {
  const colors: Record<string, { active: string }> = {
    emerald: { active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    amber: { active: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    violet: { active: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  };
  const c = colors[color] || colors.emerald;
  const active = tab === current;
  return (
    <button
      onClick={() => onClick(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
        active ? c.active : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

// ============================================
// EXECUTIVE OVERVIEW (always visible)
// ============================================
function ExecutiveOverview({ finance, infra, tickets, soporte, cobranzas }: {
  finance: FinanceStats | null;
  infra: InfraOverview | null;
  tickets: TicketStats | null;
  soporte: SoporteData | null;
  cobranzas: CobranzasStats | null;
}) {
  // Alerts that need action
  const alerts: { text: string; severity: "critical" | "high" | "medium" }[] = [];

  // Network critical problems
  const highProblems = (infra?.problemsBySeverity?.high || 0) + (infra?.problemsBySeverity?.disaster || 0);
  if (highProblems > 0) alerts.push({ text: `${highProblems} problema${highProblems > 1 ? "s" : ""} de red high/disaster`, severity: "critical" });

  // Tickets open (from Kommo soporte)
  if (soporte && soporte.tickets_open > 10) alerts.push({ text: `${soporte.tickets_open} tickets sin atender`, severity: "high" });

  // Deuda > 60 days
  const over60 = finance?.aging?.bucket_60_plus;
  if (over60 && over60.count > 0) alerts.push({ text: `${over60.count} clientes con deuda >60 dias ($${fmtShort(over60.total)})`, severity: "high" });

  // SLA breached (from Supabase tickets if available)
  if (tickets && tickets.sla_breached > 0) alerts.push({ text: `${tickets.sla_breached} ticket${tickets.sla_breached > 1 ? "s" : ""} SLA violado`, severity: "high" });

  // Cobranzas active
  if (cobranzas && cobranzas.active > 0) alerts.push({ text: `${cobranzas.active} casos de cobranza activos ($${fmtShort(cobranzas.active_amount)})`, severity: "medium" });

  const severityColor = { critical: "text-red-400", high: "text-orange-400", medium: "text-amber-400" };
  const severityDot = { critical: "bg-red-400", high: "bg-orange-400", medium: "bg-amber-400" };

  // Net services change (not available without historical data, show paused >30d from aging)
  const pausedServices = finance?.paused_services || 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* INGRESOS */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <DollarSign size={16} className="text-emerald-400" />
          </div>
          <span className="text-xs text-gray-500 font-medium">Ingresos</span>
        </div>
        <p className="text-2xl font-bold text-white">{finance ? fmtUsd(finance.mrr_usd) : "..."}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">MRR servicios activos</p>
        <div className="mt-2 pt-2 border-t border-wuipi-border flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Cobrado: {finance ? fmtBs(finance.collected_ved) : "..."}
          </span>
          {finance?.prev_collected_ved ? (
            <DeltaBadge current={finance.collected_ved} previous={finance.prev_collected_ved} />
          ) : null}
        </div>
      </Card>

      {/* RED */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Wifi size={16} className="text-cyan-400" />
          </div>
          <span className="text-xs text-gray-500 font-medium">Red</span>
        </div>
        <p className="text-2xl font-bold text-white">
          {infra ? `${infra.uptimePercent?.toFixed(1) || Math.round((infra.hostsUp / Math.max(infra.totalHosts, 1)) * 1000) / 10}%` : "..."}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {infra ? `${infra.hostsUp}/${infra.totalHosts} hosts online` : "uptime"}
        </p>
        <div className="mt-2 pt-2 border-t border-wuipi-border">
          {infra && infra.totalProblems > 0 ? (
            <span className={`text-xs ${highProblems > 0 ? "text-red-400" : "text-amber-400"}`}>
              {infra.totalProblems} problema{infra.totalProblems > 1 ? "s" : ""} activo{infra.totalProblems > 1 ? "s" : ""}
              {highProblems > 0 && ` (${highProblems} high)`}
            </span>
          ) : (
            <span className="text-xs text-emerald-400">Sin problemas</span>
          )}
        </div>
      </Card>

      {/* CLIENTES */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Users size={16} className="text-violet-400" />
          </div>
          <span className="text-xs text-gray-500 font-medium">Servicios</span>
        </div>
        <p className="text-2xl font-bold text-white">{finance ? finance.active_services.toLocaleString() : "..."}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">activos</p>
        <div className="mt-2 pt-2 border-t border-wuipi-border flex items-center gap-3">
          <span className="text-xs text-amber-400">{pausedServices} pausados</span>
          {soporte && soporte.active_tickets > 0 && (
            <span className="text-xs text-gray-500">{soporte.active_tickets} tickets</span>
          )}
        </div>
      </Card>

      {/* ALERTAS / ACCION */}
      <Card className="!p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-8 h-8 rounded-lg ${alerts.length > 0 ? "bg-red-500/10" : "bg-emerald-500/10"} flex items-center justify-center`}>
            <Bell size={16} className={alerts.length > 0 ? "text-red-400" : "text-emerald-400"} />
          </div>
          <span className="text-xs text-gray-500 font-medium">Acciones</span>
        </div>
        {alerts.length === 0 ? (
          <>
            <p className="text-2xl font-bold text-emerald-400">0</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Sin alertas pendientes</p>
          </>
        ) : (
          <div className="space-y-1.5 max-h-[80px] overflow-auto">
            {alerts.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${severityDot[a.severity]} shrink-0`} />
                <span className={`text-[10px] ${severityColor[a.severity]} leading-tight`}>{a.text}</span>
              </div>
            ))}
            {alerts.length > 4 && <p className="text-[10px] text-gray-600">+{alerts.length - 4} mas</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================
// TAB: FINANZAS
// ============================================
function BankDistribution() {
  const [data, setData] = useState<JournalPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = [];
    const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${names[d.getMonth()]} ${d.getFullYear()}` });
    }
    return opts;
  })();

  const fetchData = useCallback(async (month: string) => {
    setLoading(true);
    try {
      const [y, m] = month.split("-");
      const res = await fetch(`/api/odoo/payments-by-journal?year=${y}&month=${m}`);
      if (res.ok) { const d = await res.json(); setData(Array.isArray(d) ? d : []); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(selectedMonth); }, [selectedMonth, fetchData]);

  const maxTotal = Math.max(...data.map(j => j.total), 1);
  const grandTotal = data.reduce((s, j) => s + j.total, 0);
  const colors = ["bg-emerald-500", "bg-cyan-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-blue-500", "bg-orange-500"];

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-white">Cobros por Banco</h3>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-wuipi-bg border border-wuipi-border rounded-lg px-2 py-1 text-xs text-gray-300 outline-none focus:border-wuipi-accent">
          {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw size={16} className="animate-spin text-gray-500" /></div>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">Sin movimientos</p>
      ) : (
        <div className="space-y-3">
          {data.map((j, i) => {
            const pct = grandTotal > 0 ? Math.round((j.total / grandTotal) * 100) : 0;
            const isUsd = j.currency === "USD" || j.currency === "EUR" || j.journal_name.includes("USD");
            return (
              <div key={j.journal_id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-300 font-medium truncate max-w-[200px]">{j.journal_name}</span>
                  <span className="text-gray-400">
                    {j.count} mov. — {isUsd ? fmtUsd(j.total) : fmtBs(j.total)} <span className="text-gray-600">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 bg-wuipi-bg rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all`}
                    style={{ width: `${Math.max((j.total / maxTotal) * 100, 2)}%` }} />
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-wuipi-border flex items-center justify-between text-xs">
            <span className="text-gray-500">Total: {data.reduce((s, j) => s + j.count, 0)} movimientos</span>
            <span className="text-white font-semibold">{fmtBs(grandTotal)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

const COBRANZA_STAGE_NAMES: Record<string, string> = {
  leads_entrantes: "Entrantes", contacto_inicial: "Contacto inicial", info_enviada: "Info enviada",
  no_clasificado: "Sin clasificar", gestion_suspendidos: "Suspendidos", gestion_pre_retiro: "Pre-retiro",
  gestion_cobranza: "Cobranza activa", recuperado: "Recuperados", retirado_definitivo: "Retirados",
};
const COBRANZA_STAGE_COLORS: Record<string, string> = {
  leads_entrantes: "bg-blue-500", contacto_inicial: "bg-cyan-500", info_enviada: "bg-violet-500",
  no_clasificado: "bg-gray-500", gestion_suspendidos: "bg-amber-500", gestion_pre_retiro: "bg-orange-500",
  gestion_cobranza: "bg-red-500", recuperado: "bg-emerald-500", retirado_definitivo: "bg-gray-600",
};

function FinanzasTab({ stats, cobranzas, nodes }: { stats: FinanceStats | null; cobranzas: CobranzasStats | null; nodes: MikrotikNode[] }) {
  if (!stats) return <LoadingPlaceholder />;

  const effectiveness = stats.invoiced_ved > 0
    ? Math.round((stats.collected_ved / stats.invoiced_ved) * 1000) / 10
    : 0;

  // Aging
  const agingBuckets = [
    { label: "0-15 dias", ...stats.aging.bucket_0_15, color: "bg-emerald-500" },
    { label: "16-30 dias", ...stats.aging.bucket_16_30, color: "bg-amber-500" },
    { label: "31-60 dias", ...stats.aging.bucket_31_60, color: "bg-orange-500" },
    { label: "60+ dias", ...stats.aging.bucket_60_plus, color: "bg-red-500" },
  ];
  const maxAgingTotal = Math.max(...agingBuckets.map((b) => b.total), 1);

  // MRR by plan category
  const mrrByCategory = stats.plan_distribution.map(cat => ({
    category: cat.category,
    active: cat.active,
    paused: cat.paused,
    total: cat.total,
  })).sort((a, b) => b.active - a.active);

  // Cobranzas pipeline
  const cobranzaStages = cobranzas ? Object.entries(cobranzas.by_stage)
    .filter(([, v]) => v.count > 0)
    .filter(([k]) => !["recuperado", "retirado_definitivo"].includes(k))
    .map(([stage, data]) => ({
      stage, label: COBRANZA_STAGE_NAMES[stage] || stage,
      color: COBRANZA_STAGE_COLORS[stage] || "bg-gray-500", ...data,
    })) : [];
  const maxCobranzaCount = Math.max(...cobranzaStages.map(s => s.count), 1);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="MRR" value={fmtUsd(stats.mrr_usd)} icon={DollarSign} color="cyan"
          sub={`${stats.active_subscriptions} servicios activos`} />
        <KPICard label="Cobrado este mes" value={fmtBs(stats.collected_ved)} icon={CreditCard} color="emerald"
          sub={`${stats.invoices_count_ved} facturas (VED) + ${stats.invoices_count_usd} (USD)`} />
        <KPICard label="Cuentas por cobrar" value={fmtUsd(stats.overdue_total_usd)} icon={BarChart3} color="amber"
          sub={`${stats.overdue_count} clientes con deuda`} />
        <KPICard label="Efectividad" value={`${effectiveness}%`} icon={Activity} color={effectiveness >= 80 ? "emerald" : effectiveness >= 60 ? "amber" : "red"}
          sub={`Cobrado vs facturado (VED)`} />
      </div>

      {/* Aging + Cobranzas Pipeline */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">Antiguedad de Cartera (USD)</h3>
          <div className="space-y-3">
            {agingBuckets.map((b) => (
              <div key={b.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">{b.label}</span>
                  <span className="text-gray-300 font-medium">{b.count} clientes — {fmtUsd(b.total)}</span>
                </div>
                <div className="h-2 bg-wuipi-bg rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${b.color}`}
                    style={{ width: `${Math.max((b.total / maxAgingTotal) * 100, b.count > 0 ? 3 : 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-wuipi-border flex items-center justify-between text-xs">
            <span className="text-gray-500">Tasa BCV</span>
            <span className="text-white font-medium">{stats.exchange_rate ? `Bs ${stats.exchange_rate.toFixed(2)} / USD` : "—"}</span>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">Pipeline de Cobranzas</h3>
            {cobranzas && (
              <span className="text-xs text-gray-500">
                Recovery: <span className={cobranzas.recovery_rate >= 50 ? "text-emerald-400" : "text-amber-400"}>
                  {cobranzas.recovery_rate}%
                </span>
              </span>
            )}
          </div>
          {cobranzaStages.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin casos activos</p>
          ) : (
            <div className="space-y-2.5">
              {cobranzaStages.map((s) => (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">{s.label}</span>
                    <span className="text-gray-400">{s.count} — {fmtUsd(s.amount)}</span>
                  </div>
                  <div className="h-2 bg-wuipi-bg rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${Math.max((s.count / maxCobranzaCount) * 100, 5)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {cobranzas && (cobranzas.recovered > 0 || cobranzas.retired > 0) && (
            <div className="mt-3 pt-3 border-t border-wuipi-border flex items-center gap-4 text-xs">
              <span className="text-emerald-400">{cobranzas.recovered} recuperados</span>
              <span className="text-gray-500">{cobranzas.retired} retirados</span>
            </div>
          )}
        </Card>
      </div>

      {/* Effectiveness Chart + Top Deudores */}
      <div className="grid grid-cols-2 gap-4">
        {stats.monthly_history && stats.monthly_history.length > 0 && (
          <Card>
            <h3 className="text-base font-bold text-white mb-1">Efectividad de Cobranza</h3>
            <p className="text-xs text-gray-500 mb-4">Deuda acumulada vs Cobrado del mes (USD equiv.)</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthly_history} barCategoryGap="20%">
                  <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => `$${fmtShort(v)}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #1e293b", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}
                    formatter={(value: number, name: string) => [fmtUsd(value), name === "Deuda" ? "Deuda acumulada" : "Cobrado del mes"]}
                  />
                  <Bar dataKey="drafted_usd" name="Deuda" fill="#f59e0b" fillOpacity={0.6} radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="collected_usd" name="Cobrado" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 pt-2 border-t border-wuipi-border">
              <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="w-2.5 h-2.5 rounded bg-amber-500/60 inline-block" /> Deuda acumulada</span>
              <span className="flex items-center gap-1.5 text-[10px] text-gray-500"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Cobrado</span>
            </div>
            <div className="grid grid-cols-6 gap-1 mt-2">
              {stats.monthly_history.map((m) => (
                <div key={m.month} className="text-center py-1.5 bg-wuipi-bg rounded">
                  <p className="text-[9px] text-gray-600">{m.label.split(" ")[0]}</p>
                  <p className={`text-sm font-bold ${m.effectiveness >= 100 ? "text-emerald-400" : m.effectiveness >= 80 ? "text-cyan-400" : m.effectiveness > 0 ? "text-amber-400" : "text-gray-600"}`}>
                    {m.effectiveness > 0 ? `${m.effectiveness}%` : "—"}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h3 className="text-base font-bold text-white mb-4">Top 10 Deudores</h3>
          {stats.top_debtors.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Sin deudores</p>
          ) : (
            <div className="overflow-auto max-h-[320px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-wuipi-card">
                  <tr className="text-gray-500 border-b border-wuipi-border">
                    <th className="text-left py-1.5 px-2 font-medium">#</th>
                    <th className="text-left py-1.5 px-2 font-medium">Cliente</th>
                    <th className="text-right py-1.5 px-2 font-medium">Fact.</th>
                    <th className="text-right py-1.5 px-2 font-medium">Deuda</th>
                    <th className="text-right py-1.5 px-2 font-medium">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_debtors.map((d, i) => {
                    const days = d.oldest_due_date ? Math.floor((Date.now() - new Date(d.oldest_due_date).getTime()) / 86400000) : 0;
                    const dayColor = days > 60 ? "text-red-400" : days > 30 ? "text-orange-400" : "text-gray-400";
                    return (
                      <tr key={d.partner_id} className="border-b border-wuipi-border/50">
                        <td className="py-1.5 px-2 text-gray-600">{i + 1}</td>
                        <td className="py-1.5 px-2 text-white truncate max-w-[180px]">{d.name}</td>
                        <td className="py-1.5 px-2 text-right text-gray-400">{d.invoice_count}</td>
                        <td className="py-1.5 px-2 text-right text-amber-400 font-medium">{fmtUsd(d.total_due)}</td>
                        <td className={`py-1.5 px-2 text-right font-medium ${dayColor}`}>{days}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Cobros por banco + MRR por Nodo */}
      <div className="grid grid-cols-2 gap-4">
        <BankDistribution />

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">MRR por Nodo</h3>
            <Link href="/infraestructura" className="text-xs text-[#F46800] hover:underline flex items-center gap-1">
              Nodos <ExternalLink size={12} />
            </Link>
          </div>
          {nodes.length > 0 ? (
            <>
              <div className="space-y-2 max-h-[280px] overflow-auto">
                {nodes.filter(n => n.mrr_usd > 0).slice(0, 15).map((node) => {
                  const maxMrr = Math.max(...nodes.map(n => n.mrr_usd), 1);
                  return (
                    <div key={node.id}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-300 font-medium">{node.name}</span>
                        <span className="text-gray-400">
                          <span className="text-emerald-400 font-medium">{fmtUsd(node.mrr_usd)}</span>
                          <span className="ml-1 text-gray-600">({node.services_active} act)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-wuipi-bg rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(node.mrr_usd / maxMrr) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-wuipi-border flex items-center justify-between text-xs">
                <span className="text-gray-500">{nodes.length} nodos</span>
                <span className="text-white font-medium">
                  MRR total: {fmtUsd(nodes.reduce((s, n) => s + n.mrr_usd, 0))}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">Cargando nodos...</p>
          )}
        </Card>
      </div>

      {/* Servicios por categoria (compact) */}
      {mrrByCategory.length > 0 && (
        <Card>
          <h3 className="text-base font-bold text-white mb-3">Servicios por Categoria</h3>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            {mrrByCategory.map((cat) => (
              <div key={cat.category} className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
                <p className="text-xs text-gray-500 mb-1">{cat.category}</p>
                <p className="text-lg font-bold text-white">{cat.active}</p>
                {cat.paused > 0 && <p className="text-[10px] text-amber-400">+{cat.paused} pau</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================
// TAB: OPERACIONES (Soporte + Infra + Calidad)
// ============================================
function OperacionesTab({ infra, problems, hosts, infraLoading }: {
  infra: InfraOverview | null;
  problems: InfraProblem[];
  hosts: InfraHost[];
  infraLoading: boolean;
}) {
  const [soporte, setSoporte] = useState<SoporteData | null>(null);
  const [period, setPeriod] = useState("30d");
  const [soporteLoading, setSoporteLoading] = useState(true);

  const fetchSoporte = useCallback(async (p: string) => {
    setSoporteLoading(true);
    try {
      const res = await fetch(`/api/soporte?period=${p}`);
      if (res.ok) setSoporte(await res.json());
    } catch { /* ignore */ }
    finally { setSoporteLoading(false); }
  }, []);

  useEffect(() => { fetchSoporte(period); }, [period, fetchSoporte]);

  if (!soporte && infraLoading) return <LoadingPlaceholder />;

  const uptimePct = infra ? (infra.uptimePercent || Math.round((infra.hostsUp / Math.max(infra.totalHosts, 1)) * 1000) / 10) : 0;

  const PERIOD_OPTIONS = [
    { value: "today", label: "Hoy" },
    { value: "7d", label: "7 dias" },
    { value: "30d", label: "30 dias" },
    { value: "90d", label: "90 dias" },
  ];

  // Category colors
  const CAT_COLORS: Record<string, string> = {
    sin_servicio: "#ef4444", lentitud_intermitencia: "#f59e0b", red_interna: "#8b5cf6",
    infraestructura: "#06b6d4", gestion: "#3b82f6", cableado: "#f97316",
    desincorporacion: "#6b7280", administrativo: "#a78bfa", visita_l2c: "#10b981",
    bot_reactivado: "#ec4899", sin_clasificar: "#9ca3af",
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Uptime de red" value={infra ? `${uptimePct.toFixed(1)}%` : "..."} icon={Wifi} color={uptimePct >= 95 ? "emerald" : uptimePct >= 85 ? "amber" : "red"}
          sub={infra ? `${infra.hostsUp}/${infra.totalHosts} hosts` : undefined} />
        <KPICard label="Tickets abiertos" value={soporte ? soporte.active_tickets.toString() : "..."} icon={Headphones}
          color={soporte && soporte.active_tickets > 30 ? "red" : "cyan"}
          sub={soporte ? `${soporte.tickets_open} nuevos, ${soporte.tickets_pending} pendientes` : undefined} />
        <KPICard label="En progreso" value={soporte ? soporte.tickets_in_progress.toString() : "..."} icon={Activity} color="amber"
          sub={soporte ? `de ${soporte.total_leads} totales (30d)` : undefined} />
        <KPICard label="Resueltos hoy" value={soporte ? soporte.tickets_resolved_today.toString() : "..."} icon={Zap} color="emerald" />
      </div>

      {/* Period filter bar */}
      <Card className="!p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">Soporte</span>
          <div className="flex gap-1 bg-wuipi-bg rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === opt.value
                    ? "bg-amber-500/15 text-amber-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-300"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
          {soporteLoading && <RefreshCw size={12} className="animate-spin text-gray-500" />}
        </div>
        {soporte && (
          <span className="text-xs text-gray-500">
            {soporte.total_leads} tickets en periodo — {soporte.active_tickets} activos
          </span>
        )}
      </Card>

      {/* Red: Problemas + Hosts down */}
      {infra?.zabbixConnected === false && <ZabbixBanner />}
      <AlertBanner hosts={hosts} />

      <div className="grid grid-cols-2 gap-4">
        {/* Problemas por severidad */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">Problemas de Red</h3>
            <Link href="/infraestructura" className="text-xs text-[#F46800] hover:underline flex items-center gap-1">
              Monitoreo <ExternalLink size={12} />
            </Link>
          </div>
          {infra && infra.totalProblems > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "High/Disaster", count: (infra.problemsBySeverity?.high || 0) + (infra.problemsBySeverity?.disaster || 0), color: "text-red-400", bg: "bg-red-500/10" },
                  { label: "Average", count: infra.problemsBySeverity?.average || 0, color: "text-orange-400", bg: "bg-orange-500/10" },
                  { label: "Warning", count: (infra.problemsBySeverity?.warning || 0) + (infra.problemsBySeverity?.information || 0), color: "text-amber-400", bg: "bg-amber-500/10" },
                ].map((s) => (
                  <div key={s.label} className={`p-3 rounded-xl ${s.bg} text-center`}>
                    <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
                    <p className="text-[10px] text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
              <ProblemasActivos problems={problems.slice(0, 5)} selectedSite={null} />
              {problems.length > 5 && (
                <Link href="/infraestructura" className="text-xs text-gray-500 hover:text-[#F46800] mt-2 block text-center">
                  +{problems.length - 5} problemas mas
                </Link>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <Wifi size={32} className="mx-auto mb-2 text-emerald-500/50" />
              <p className="text-sm text-emerald-400">Red estable — sin problemas</p>
            </div>
          )}
        </Card>

        {/* Razones de atencion (from Kommo) */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-white">Razones de Atencion</h3>
            <Link href="/soporte" className="text-xs text-[#F46800] hover:underline flex items-center gap-1">
              Soporte <ExternalLink size={12} />
            </Link>
          </div>
          {soporte && soporte.by_category.length > 0 ? (
            <div className="space-y-2.5">
              {soporte.by_category.slice(0, 8).map((cat) => {
                const maxCat = Math.max(...soporte.by_category.map(c => c.count), 1);
                const color = CAT_COLORS[cat.category] || "#6b7280";
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {cat.label}
                      </span>
                      <span className="text-gray-400">
                        <span className="text-white font-medium">{cat.count}</span>
                        <span className="ml-1">({cat.percentage}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-wuipi-bg rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(cat.count / maxCat) * 100}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">Sin datos de soporte</p>
          )}
        </Card>
      </div>

      {/* Carga por tecnico + Stats resumen */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">Carga por Tecnico</h3>
          {soporte && soporte.by_technician.length > 0 ? (
            <div className="space-y-2">
              {soporte.by_technician.slice(0, 8).map((tech) => {
                const maxTech = Math.max(...soporte.by_technician.map(t => t.tickets_total), 1);
                const loadColor = tech.tickets_open > 10 ? "bg-red-500" : tech.tickets_open > 5 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div key={tech.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-300">{tech.name}</span>
                      <span className="text-gray-400">
                        <span className="text-white font-medium">{tech.tickets_total}</span> total
                        {tech.tickets_open > 0 && <span className="text-amber-400 ml-1">({tech.tickets_open} abiertos)</span>}
                      </span>
                    </div>
                    <div className="h-1.5 bg-wuipi-bg rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${loadColor}`} style={{ width: `${(tech.tickets_total / maxTech) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">Sin asignaciones</p>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-bold text-white mb-4">Resumen Operativo</h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Tickets nuevos" value={soporte?.tickets_open.toString() || "0"} color="text-amber-400" />
            <MiniStat label="En progreso" value={soporte?.tickets_in_progress.toString() || "0"} color="text-cyan-400" />
            <MiniStat label="Resueltos hoy" value={soporte?.tickets_resolved_today.toString() || "0"} color="text-emerald-400" />
            <MiniStat label="Hosts offline" value={infra ? infra.hostsDown.toString() : "0"} color={infra && infra.hostsDown > 0 ? "text-red-400" : "text-emerald-400"} />
          </div>
          {infra && (
            <div className="mt-3 pt-3 border-t border-wuipi-border">
              <Link href="/infraestructura" className="text-xs text-[#F46800] hover:underline flex items-center gap-1">
                Ver infraestructura completa <ExternalLink size={12} />
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============================================
// TAB: CRECIMIENTO (Ventas + Retención)
// ============================================
function CrecimientoTab({ ventas, finance, cobranzas }: {
  ventas: VentasStats | null;
  finance: FinanceStats | null;
  cobranzas: CobranzasStats | null;
}) {
  if (!ventas) return <LoadingPlaceholder />;

  const STAGE_ORDER = [
    "incoming", "contacto_inicial", "info_enviada", "en_instalacion",
    "prueba_actualizacion", "retirado_reactivacion", "ganado", "no_concretado", "no_factible", "no_clasificado",
  ];
  const STAGE_NAMES: Record<string, string> = {
    incoming: "Entrantes", contacto_inicial: "Contacto inicial", info_enviada: "Info enviada",
    en_instalacion: "Instalacion", prueba_actualizacion: "Prueba/Upgrade", retirado_reactivacion: "Reactivacion",
    ganado: "Ganados", no_concretado: "No concretados", no_factible: "No factibles", no_clasificado: "Sin clasificar",
  };
  const STAGE_COLORS: Record<string, string> = {
    incoming: "bg-blue-500", contacto_inicial: "bg-cyan-500", info_enviada: "bg-violet-500",
    en_instalacion: "bg-amber-500", prueba_actualizacion: "bg-indigo-500", retirado_reactivacion: "bg-orange-500",
    ganado: "bg-emerald-500", no_concretado: "bg-red-500", no_factible: "bg-gray-500", no_clasificado: "bg-gray-400",
  };

  const pipelineStages = STAGE_ORDER
    .filter(s => ventas.by_stage[s])
    .map(s => ({
      stage: s, label: STAGE_NAMES[s] || s,
      count: ventas.by_stage[s].count, value: ventas.by_stage[s].value,
      color: STAGE_COLORS[s] || "bg-gray-500",
    }));
  const maxCount = Math.max(...pipelineStages.map(s => s.count), 1);

  // Retention metrics
  const pausedServices = finance?.paused_services || 0;
  const activeServices = finance?.active_services || 0;
  const pausedPct = activeServices > 0 ? Math.round((pausedServices / (activeServices + pausedServices)) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Leads activos" value={ventas.active.toString()} icon={UserPlus} color="cyan"
          sub={`${ventas.created_this_week} esta semana`} />
        <KPICard label="Pipeline" value={`$${fmt(ventas.pipeline_value)}`} icon={DollarSign} color="emerald"
          sub={`${ventas.total} leads totales`} />
        <KPICard label="Conversion" value={`${ventas.conversion_rate}%`} icon={TrendingUp} color="violet"
          sub={`${ventas.won} ganados / ${ventas.total} total`} />
        <KPICard label="Ganados este mes" value={ventas.won_this_month.toString()} icon={Zap} color="emerald"
          sub={`${ventas.created_this_month} creados`} />
      </div>

      {/* Pipeline + Resumen */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">Pipeline por Etapa</h3>
          {ventas.total === 0 ? (
            <div className="text-center py-8">
              <TrendingUp size={32} className="mx-auto mb-2 text-gray-600" />
              <p className="text-sm text-gray-500">Sin leads registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pipelineStages.map((stage) => {
                const widthPct = Math.max((stage.count / maxCount) * 100, 15);
                return (
                  <div key={stage.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{stage.label}</span>
                      <span className="text-gray-500">{stage.count} · ${stage.value.toLocaleString()}</span>
                    </div>
                    <div className="h-7 bg-wuipi-bg rounded-lg overflow-hidden flex items-center">
                      <div className={`h-full ${stage.color}/30 rounded-lg flex items-center px-3`}
                        style={{ width: `${widthPct}%` }}>
                        <span className="text-xs font-bold text-white">{stage.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="text-base font-bold text-white mb-4">Resumen Comercial</h3>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Total leads" value={ventas.total.toString()} color="text-white" />
              <MiniStat label="Activos" value={ventas.active.toString()} color="text-cyan-400" />
              <MiniStat label="Ganados" value={ventas.won.toString()} color="text-emerald-400" />
              <MiniStat label="Perdidos" value={ventas.lost.toString()} color="text-red-400" />
            </div>
          </Card>

          {/* Retencion */}
          <Card>
            <h3 className="text-base font-bold text-white mb-3">Retencion</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">Servicios pausados</span>
                  <span className={pausedPct > 20 ? "text-red-400" : pausedPct > 10 ? "text-amber-400" : "text-gray-300"}>
                    {pausedServices} ({pausedPct}%)
                  </span>
                </div>
                <div className="h-2 bg-wuipi-bg rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pausedPct > 20 ? "bg-red-500" : pausedPct > 10 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(pausedPct, 100)}%` }} />
                </div>
              </div>
              {cobranzas && (
                <div className="flex items-center justify-between text-xs pt-2 border-t border-wuipi-border">
                  <span className="text-gray-400">Recovery rate (cobranzas)</span>
                  <span className={cobranzas.recovery_rate >= 50 ? "text-emerald-400" : "text-amber-400"}>
                    {cobranzas.recovery_rate}%
                  </span>
                </div>
              )}
              {cobranzas && cobranzas.active > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Casos activos</span>
                  <span className="text-amber-400">{cobranzas.active} ({fmtUsd(cobranzas.active_amount)})</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SHARED
// ============================================
function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw size={24} className="animate-spin text-gray-500" />
      <span className="ml-3 text-gray-500">Cargando datos...</span>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function ComandoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(tabFromUrl && ["finanzas", "operaciones", "crecimiento"].includes(tabFromUrl) ? tabFromUrl : "finanzas");

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const [financeStats, setFinanceStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [infraOverview, setInfraOverview] = useState<InfraOverview | null>(null);
  const [infraProblems, setInfraProblems] = useState<InfraProblem[]>([]);
  const [infraHosts, setInfraHosts] = useState<InfraHost[]>([]);
  const [infraLoading, setInfraLoading] = useState(true);

  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null);
  const [soporteData, setSoporteData] = useState<SoporteData | null>(null);
  const [ventasStats, setVentasStats] = useState<VentasStats | null>(null);
  const [cobranzasStats, setCobranzasStats] = useState<CobranzasStats | null>(null);
  const [mikrotikNodes, setMikrotikNodes] = useState<MikrotikNode[]>([]);

  const loadFinanceStats = useCallback(async () => {
    try {
      let res = await fetch("/api/odoo/financial-summary");
      if (!res.ok) res = await fetch("/api/facturacion/stats");
      if (res.ok) setFinanceStats(await res.json());
    } catch (err) { console.error("Error loading finance:", err); }
    finally { setLoading(false); }
  }, []);

  const loadInfraData = useCallback(async () => {
    try {
      const [overview, problems, hosts] = await Promise.all([
        fetch("/api/infraestructura").then(r => r.json()),
        fetch("/api/infraestructura/problems").then(r => r.json()),
        fetch("/api/infraestructura/hosts").then(r => r.json()),
      ]);
      setInfraOverview(overview);
      setInfraProblems(problems);
      setInfraHosts(hosts);
    } catch (err) { console.error("Error loading infra:", err); }
    finally { setInfraLoading(false); }
  }, []);

  const loadTicketStats = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets/stats");
      if (res.ok) setTicketStats(await res.json());
    } catch (err) { console.error("Error loading tickets:", err); }
  }, []);

  const loadSoporteData = useCallback(async () => {
    try {
      const res = await fetch("/api/soporte?period=30d");
      if (res.ok) setSoporteData(await res.json());
    } catch (err) { console.error("Error loading soporte:", err); }
  }, []);

  const loadVentasStats = useCallback(async () => {
    try {
      const res = await fetch("/api/crm-ventas/stats");
      if (res.ok) setVentasStats(await res.json());
    } catch (err) { console.error("Error loading ventas:", err); }
  }, []);

  const loadCobranzasStats = useCallback(async () => {
    try {
      const res = await fetch("/api/cobranzas/stats");
      if (res.ok) setCobranzasStats(await res.json());
    } catch (err) { console.error("Error loading cobranzas:", err); }
  }, []);

  const loadMikrotikNodes = useCallback(async () => {
    try {
      const res = await fetch("/api/infraestructura/nodes");
      if (res.ok) { const data = await res.json(); setMikrotikNodes(data.nodes || []); }
    } catch (err) { console.error("Error loading nodes:", err); }
  }, []);

  useEffect(() => {
    loadFinanceStats();
    loadInfraData();
    loadTicketStats();
    loadSoporteData();
    loadVentasStats();
    loadCobranzasStats();
    loadMikrotikNodes();
    const interval = setInterval(loadInfraData, 60000);
    return () => clearInterval(interval);
  }, [loadFinanceStats, loadInfraData, loadTicketStats, loadSoporteData, loadVentasStats, loadCobranzasStats, loadMikrotikNodes]);

  const refreshAll = () => {
    loadFinanceStats();
    loadInfraData();
    loadTicketStats();
    loadSoporteData();
    loadVentasStats();
    loadCobranzasStats();
    loadMikrotikNodes();
  };

  return (
    <>
      <TopBar
        title="Centro de Comando"
        icon={<Target size={22} />}
        actions={
          <button onClick={refreshAll}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white text-sm transition-colors">
            <RefreshCw size={14} /> Actualizar
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Executive Overview — always visible */}
        <ExecutiveOverview finance={financeStats} infra={infraOverview} tickets={ticketStats} soporte={soporteData} cobranzas={cobranzasStats} />

        {/* Tab Selector */}
        <div className="flex gap-2 border-b border-wuipi-border pb-3">
          <TabButton tab="finanzas" current={tab} icon={DollarSign} label="Finanzas" color="emerald" onClick={setTab} />
          <TabButton tab="operaciones" current={tab} icon={Server} label="Operaciones" color="amber" onClick={setTab} />
          <TabButton tab="crecimiento" current={tab} icon={TrendingUp} label="Crecimiento" color="violet" onClick={setTab} />
        </div>

        {/* Tab Content */}
        {tab === "finanzas" && <FinanzasTab stats={financeStats} cobranzas={cobranzasStats} nodes={mikrotikNodes} />}
        {tab === "operaciones" && <OperacionesTab infra={infraOverview} problems={infraProblems} hosts={infraHosts} infraLoading={infraLoading} />}
        {tab === "crecimiento" && <CrecimientoTab ventas={ventasStats} finance={financeStats} cobranzas={cobranzasStats} />}
      </div>
    </>
  );
}
