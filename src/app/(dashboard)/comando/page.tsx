"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing, StatusBadge, LoadBar } from "@/components/dashboard";
import type { InfraOverview, InfraProblem, InfraHost } from "@/types/zabbix";
import {
  Target, DollarSign, Headphones, Radio, TrendingUp,
  RefreshCw, AlertTriangle, Clock, Users, Wifi, WifiOff,
  ArrowUpRight, ArrowDownRight, Activity, Zap,
  Receipt, CreditCard, BarChart3, UserPlus, Phone, Server,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
type Tab = "financiero" | "soporte" | "infraestructura" | "ventas";

interface FinanceStats {
  total_clients: number;
  active_clients: number;
  invoiced_usd: number;
  invoiced_ves: number;
  collected_usd: number;
  collected_ves: number;
  collection_rate: number;
  overdue_count: number;
  overdue_total_usd: number;
  exchange_rate: number | null;
  invoices_this_month: number;
  invoices_paid: number;
  pending_payments: number;
}

// ============================================
// TAB BUTTON
// ============================================
function TabButton({ tab, current, icon: Icon, label, color, onClick }: {
  tab: Tab; current: Tab; icon: any; label: string; color: string; onClick: (t: Tab) => void;
}) {
  const active = tab === current;
  const colors: Record<string, { active: string; dot: string }> = {
    emerald: { active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-400" },
    cyan: { active: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", dot: "bg-cyan-400" },
    amber: { active: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-400" },
    violet: { active: "bg-violet-500/10 text-violet-400 border-violet-500/20", dot: "bg-violet-400" },
  };
  const c = colors[color] || colors.cyan;
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
// OVERVIEW CARDS (top row, always visible)
// ============================================
function OverviewCards({ financeStats, infraOverview }: { financeStats: FinanceStats | null; infraOverview: InfraOverview | null }) {
  const infraScore = infraOverview?.healthScore ?? 0;
  const infraStatus = infraScore > 85 ? "operational" as const : infraScore > 60 ? "warning" as const : "critical" as const;

  const modules = [
    {
      label: "Finanzas", icon: "💰",
      score: financeStats?.collection_rate ?? 0,
      status: (financeStats?.collection_rate ?? 0) > 85 ? "operational" as const : (financeStats?.collection_rate ?? 0) > 70 ? "warning" as const : "critical" as const,
      detail: financeStats ? `$${financeStats.invoiced_usd.toLocaleString()} facturado` : "Cargando...",
    },
    {
      label: "Soporte", icon: "🎧", score: 78, status: "warning" as const,
      detail: "23 tickets abiertos",
    },
    {
      label: "Red", icon: "📡",
      score: infraScore,
      status: infraStatus,
      detail: infraOverview ? `${infraOverview.hostsUp}/${infraOverview.totalHosts} hosts online` : "Cargando...",
    },
    {
      label: "Ventas", icon: "📈", score: 85, status: "operational" as const,
      detail: "12 leads esta semana",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {modules.map((m) => (
        <Card key={m.label} hover className="flex items-center gap-4">
          <ScoreRing score={m.score} size={64} />
          <div className="min-w-0">
            <p className="text-sm text-gray-500 mb-1">{m.icon} {m.label}</p>
            <StatusBadge status={m.status} />
            <p className="text-xs text-gray-400 mt-1 truncate">{m.detail}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// TAB: FINANCIERO
// ============================================
function FinancieroTab({ stats, loading }: { stats: FinanceStats | null; loading: boolean }) {
  if (loading) return <LoadingPlaceholder />;
  if (!stats) return <EmptyState msg="No se pudieron cargar los datos financieros" />;

  const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {/* Main KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          label="Facturado USD" value={`$${fmt(stats.invoiced_usd)}`}
          icon={DollarSign} color="cyan"
          sub={`${stats.invoices_this_month} facturas este mes`}
        />
        <KPICard
          label="Cobrado USD" value={`$${fmt(stats.collected_usd)}`}
          icon={CreditCard} color="emerald"
          sub={`${stats.invoices_paid} pagadas`}
        />
        <KPICard
          label="Cobranza" value={`${stats.collection_rate.toFixed(1)}%`}
          icon={BarChart3} color={stats.collection_rate > 80 ? "emerald" : "amber"}
          sub="Eficiencia de cobro"
        />
        <KPICard
          label="Morosos" value={stats.overdue_count.toString()}
          icon={AlertTriangle} color="red"
          sub={`$${fmt(stats.overdue_total_usd)} pendiente`}
        />
      </div>

      {/* Row 2: Revenue breakdown + Exchange rate */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <h3 className="text-base font-bold text-white mb-4">💰 Resumen de Ingresos</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-wuipi-bg rounded-xl border border-wuipi-border">
              <p className="text-xs text-gray-500 mb-1">Facturado en USD</p>
              <p className="text-2xl font-bold text-cyan-400">${fmt(stats.invoiced_usd)}</p>
              <p className="text-xs text-gray-500 mt-1">Cobrado: ${fmt(stats.collected_usd)}</p>
            </div>
            <div className="p-4 bg-wuipi-bg rounded-xl border border-wuipi-border">
              <p className="text-xs text-gray-500 mb-1">Facturado en VES</p>
              <p className="text-2xl font-bold text-emerald-400">Bs. {fmt(stats.invoiced_ves)}</p>
              <p className="text-xs text-gray-500 mt-1">Cobrado: Bs. {fmt(stats.collected_ves)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MiniStat label="Clientes activos" value={stats.active_clients.toString()} color="text-white" />
            <MiniStat label="Total clientes" value={stats.total_clients.toString()} color="text-gray-300" />
            <MiniStat label="Pagos pendientes" value={stats.pending_payments.toString()} color="text-amber-400" />
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-bold text-white mb-4">💱 Tasa BCV</h3>
          <div className="text-center py-4">
            <p className="text-4xl font-bold text-cyan-400">
              {stats.exchange_rate ? `Bs. ${stats.exchange_rate.toFixed(2)}` : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-2">por 1 USD</p>
          </div>
          <div className="mt-4 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border">
            <p className="text-xs text-gray-500">Proyección MRR</p>
            <p className="text-lg font-bold text-white">
              ${(stats.active_clients * 15).toLocaleString()}{" "}
              <span className="text-xs text-gray-500 font-normal">USD/mes est.</span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// TAB: SOPORTE
// ============================================
function SoporteTab() {
  const mockData = {
    tickets_today: 153, open: 23, in_progress: 18, resolved: 112, unassigned: 12,
    avg_resolution: "2.4h", sla_compliance: 87,
    top_categories: [
      { name: "Sin conexión", count: 45, pct: 29 },
      { name: "Lentitud", count: 38, pct: 25 },
      { name: "Instalación", count: 27, pct: 18 },
      { name: "Facturación", count: 19, pct: 12 },
      { name: "Otros", count: 24, pct: 16 },
    ],
    technicians: [
      { name: "Carlos M.", open: 4, resolved: 12, sla: 92 },
      { name: "José R.", open: 6, resolved: 8, sla: 85 },
      { name: "Ana L.", open: 3, resolved: 15, sla: 95 },
      { name: "Pedro V.", open: 5, resolved: 10, sla: 88 },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        <KPICard label="Tickets hoy" value={mockData.tickets_today.toString()} icon={Headphones} color="cyan" />
        <KPICard label="Abiertos" value={mockData.open.toString()} icon={Clock} color="amber" />
        <KPICard label="En progreso" value={mockData.in_progress.toString()} icon={Activity} color="blue" />
        <KPICard label="Resueltos" value={mockData.resolved.toString()} icon={Zap} color="emerald" />
        <KPICard label="Sin asignar" value={mockData.unassigned.toString()} icon={AlertTriangle} color="red" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">📊 Rendimiento</h3>
          <div className="flex items-center justify-center mb-4">
            <ScoreRing score={mockData.sla_compliance} size={100} />
          </div>
          <p className="text-center text-sm text-gray-400">SLA cumplido</p>
          <div className="mt-4 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-xs text-gray-500">Tiempo promedio resolución</p>
            <p className="text-xl font-bold text-amber-400">{mockData.avg_resolution}</p>
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-bold text-white mb-4">🏷️ Top Categorías</h3>
          <div className="space-y-3">
            {mockData.top_categories.map((cat) => (
              <div key={cat.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{cat.name}</span>
                  <span className="text-gray-500">{cat.count} ({cat.pct}%)</span>
                </div>
                <div className="h-2 bg-wuipi-bg rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${cat.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="text-base font-bold text-white mb-4">👷 Carga por Técnico</h3>
          <div className="space-y-3">
            {mockData.technicians.map((tech) => (
              <div key={tech.name} className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-white">{tech.name}</span>
                  <span className={`text-xs font-bold ${tech.sla >= 90 ? "text-emerald-400" : "text-amber-400"}`}>
                    SLA {tech.sla}%
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="text-amber-400">{tech.open} abiertos</span>
                  <span className="text-emerald-400">{tech.resolved} resueltos</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// TAB: INFRAESTRUCTURA (Zabbix-powered)
// ============================================
function InfraestructuraTab({ overview, problems, hosts, loading }: {
  overview: InfraOverview | null;
  problems: InfraProblem[];
  hosts: InfraHost[];
  loading: boolean;
}) {
  if (loading) return <LoadingPlaceholder />;

  const hostsDown = hosts.filter((h) => h.status === "offline");
  const highSevProblems = problems.filter((p) => p.severity === "disaster" || p.severity === "high");

  const severityStyles: Record<string, { bg: string; border: string; dot: string }> = {
    disaster: { bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-500" },
    high: { bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400" },
    average: { bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-400" },
    warning: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-400" },
    information: { bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-400" },
    not_classified: { bg: "bg-gray-500/10", border: "border-gray-500/30", dot: "bg-gray-400" },
  };

  function formatDuration(seconds: number): string {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        <KPICard label="Hosts totales" value={overview?.totalHosts?.toString() || "0"} icon={Server} color="cyan" />
        <KPICard label="En línea" value={overview?.hostsUp?.toString() || "0"} icon={Wifi} color="emerald" />
        <KPICard label="Caídos" value={overview?.hostsDown?.toString() || "0"} icon={WifiOff} color={overview && overview.hostsDown > 0 ? "red" : "emerald"} />
        <KPICard label="Uptime" value={overview ? `${overview.uptimePercent}%` : "—"} icon={Activity} color="emerald" />
        <KPICard label="Problemas" value={overview?.totalProblems?.toString() || "0"} icon={AlertTriangle} color={overview && overview.totalProblems > 0 ? "amber" : "emerald"} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Problems list */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle size={16} /> Problemas Activos
            </h3>
            {highSevProblems.length > 0 && (
              <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-xs font-bold">
                {highSevProblems.length} críticos
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {problems.slice(0, 10).map((problem) => {
              const style = severityStyles[problem.severity] || severityStyles.not_classified;
              return (
                <div key={problem.id} className={`p-3 ${style.bg} border ${style.border} rounded-xl`}>
                  <div className="flex items-start gap-2">
                    <span className={`w-2 h-2 rounded-full ${style.dot} mt-1.5 shrink-0 shadow-[0_0_6px] shadow-current`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{problem.name}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>{problem.hostName}</span>
                        <span>{formatDuration(problem.duration)}</span>
                        {problem.acknowledged && <span className="text-emerald-400">ACK</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {problems.length === 0 && (
              <p className="text-sm text-emerald-400 text-center py-4">Sin problemas activos</p>
            )}
          </div>
        </Card>

        {/* Hosts status */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Server size={16} /> Estado de Red
            </h3>
            <span className="text-xs text-gray-500">Zabbix Live</span>
          </div>

          {/* Hosts down */}
          {hostsDown.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-red-400 font-semibold mb-2">Hosts caídos ({hostsDown.length})</p>
              <div className="space-y-2">
                {hostsDown.slice(0, 6).map((host) => (
                  <div key={host.id} className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-sm text-red-300 font-medium truncate">{host.name}</span>
                    <span className="text-xs text-gray-600 ml-auto shrink-0">{host.ip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
              <p className="text-lg font-bold text-emerald-400">{overview?.hostsUp || 0}</p>
              <p className="text-[10px] text-gray-500">Online</p>
            </div>
            <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
              <p className="text-lg font-bold text-red-400">{overview?.hostsDown || 0}</p>
              <p className="text-[10px] text-gray-500">Offline</p>
            </div>
            <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
              <p className="text-lg font-bold text-gray-400">{overview?.hostsUnknown || 0}</p>
              <p className="text-[10px] text-gray-500">Desconocido</p>
            </div>
          </div>

          {/* Health score */}
          {overview && (
            <div className="flex items-center gap-4 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border">
              <ScoreRing score={overview.healthScore} size={64} />
              <div>
                <p className="text-sm font-bold text-white">Health Score</p>
                <p className="text-xs text-gray-500">
                  {overview.problemsBySeverity.disaster > 0 && <span className="text-red-400">{overview.problemsBySeverity.disaster} disaster </span>}
                  {overview.problemsBySeverity.high > 0 && <span className="text-red-300">{overview.problemsBySeverity.high} high </span>}
                  {overview.problemsBySeverity.average > 0 && <span className="text-amber-400">{overview.problemsBySeverity.average} avg </span>}
                  {overview.problemsBySeverity.warning > 0 && <span className="text-yellow-400">{overview.problemsBySeverity.warning} warn</span>}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============================================
// TAB: VENTAS
// ============================================
function VentasTab() {
  const pipeline = [
    { stage: "Leads nuevos", count: 28, value: 4200, color: "bg-blue-500" },
    { stage: "Contactados", count: 15, value: 2250, color: "bg-cyan-500" },
    { stage: "Visita técnica", count: 8, value: 1200, color: "bg-amber-500" },
    { stage: "Propuesta", count: 5, value: 750, color: "bg-violet-500" },
    { stage: "Aprobados", count: 3, value: 450, color: "bg-emerald-500" },
  ];

  const totalLeads = pipeline.reduce((s, p) => s + p.count, 0);
  const totalValue = pipeline.reduce((s, p) => s + p.value, 0);
  const conversionRate = ((pipeline[4].count / pipeline[0].count) * 100).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Leads totales" value={totalLeads.toString()} icon={UserPlus} color="cyan" />
        <KPICard label="Pipeline value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} color="emerald" />
        <KPICard label="Conversión" value={`${conversionRate}%`} icon={TrendingUp} color="violet" />
        <KPICard label="Nuevas instalaciones" value="3" icon={Wifi} color="emerald" sub="Esta semana" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">🔄 Pipeline de Ventas</h3>
          <div className="space-y-3">
            {pipeline.map((stage) => {
              const maxCount = pipeline[0].count;
              const widthPct = Math.max((stage.count / maxCount) * 100, 15);
              return (
                <div key={stage.stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{stage.stage}</span>
                    <span className="text-gray-500">{stage.count} · ${stage.value.toLocaleString()}</span>
                  </div>
                  <div className="h-8 bg-wuipi-bg rounded-lg overflow-hidden flex items-center">
                    <div
                      className={`h-full ${stage.color}/30 rounded-lg flex items-center px-3`}
                      style={{ width: `${widthPct}%` }}
                    >
                      <span className="text-xs font-bold text-white">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="text-base font-bold text-white mb-4">📊 MRR Proyectado</h3>
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-emerald-400">$12,450</p>
              <p className="text-xs text-gray-500 mt-1">Monthly Recurring Revenue</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <MiniStat label="Nuevo MRR" value="+$450" color="text-emerald-400" />
              <MiniStat label="Churn MRR" value="-$120" color="text-red-400" />
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-bold text-white mb-3">⚡ Actividad reciente</h3>
            <div className="space-y-2">
              {[
                { action: "Lead: María G. — Plan 100Mbps", time: "Hace 1h" },
                { action: "Visita programada: Sector Lechería", time: "Hace 3h" },
                { action: "Instalación completada: Pedro R.", time: "Hace 5h" },
                { action: "Propuesta enviada: Conj. Res. Marina", time: "Ayer" },
              ].map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-gray-300">{a.action}</p>
                    <p className="text-xs text-gray-600">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
function KPICard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub?: string;
}) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-400", emerald: "text-emerald-400", amber: "text-amber-400",
    red: "text-red-400", violet: "text-violet-400", blue: "text-blue-400", white: "text-white",
  };
  const iconBg: Record<string, string> = {
    cyan: "bg-cyan-500/10", emerald: "bg-emerald-500/10", amber: "bg-amber-500/10",
    red: "bg-red-500/10", violet: "bg-violet-500/10", blue: "bg-blue-500/10", white: "bg-gray-500/10",
  };
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg[color]} flex items-center justify-center`}>
          <Icon size={18} className={colors[color]} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${colors[color]}`}>{value}</p>
          {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
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

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw size={24} className="animate-spin text-gray-500" />
      <span className="ml-3 text-gray-500">Cargando datos...</span>
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
      <AlertTriangle size={32} className="mb-3" />
      <p>{msg}</p>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function ComandoPage() {
  const [tab, setTab] = useState<Tab>("financiero");
  const [financeStats, setFinanceStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Infra state
  const [infraOverview, setInfraOverview] = useState<InfraOverview | null>(null);
  const [infraProblems, setInfraProblems] = useState<InfraProblem[]>([]);
  const [infraHosts, setInfraHosts] = useState<InfraHost[]>([]);
  const [infraLoading, setInfraLoading] = useState(true);

  const loadFinanceStats = useCallback(async () => {
    try {
      const res = await fetch("/api/facturacion/stats");
      if (res.ok) {
        const data = await res.json();
        setFinanceStats(data);
      }
    } catch (err) {
      console.error("Error loading finance stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInfraData = useCallback(async () => {
    try {
      const [overview, problems, hosts] = await Promise.all([
        fetch("/api/infraestructura").then((r) => r.json()),
        fetch("/api/infraestructura/problems").then((r) => r.json()),
        fetch("/api/infraestructura/hosts").then((r) => r.json()),
      ]);
      setInfraOverview(overview);
      setInfraProblems(problems);
      setInfraHosts(hosts);
    } catch (err) {
      console.error("Error loading infra data:", err);
    } finally {
      setInfraLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFinanceStats();
    loadInfraData();
    // Auto-refresh infra data every 60s
    const interval = setInterval(loadInfraData, 60000);
    return () => clearInterval(interval);
  }, [loadFinanceStats, loadInfraData]);

  return (
    <>
      <TopBar
        title="Centro de Comando"
        icon={<Target size={22} />}
        actions={
          <button
            onClick={() => { loadFinanceStats(); loadInfraData(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white text-sm transition-colors"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Overview Cards — always visible */}
        <OverviewCards financeStats={financeStats} infraOverview={infraOverview} />

        {/* Tab Selector */}
        <div className="flex gap-2 border-b border-wuipi-border pb-3">
          <TabButton tab="financiero" current={tab} icon={DollarSign} label="Financiero" color="emerald" onClick={setTab} />
          <TabButton tab="soporte" current={tab} icon={Headphones} label="Soporte" color="cyan" onClick={setTab} />
          <TabButton tab="infraestructura" current={tab} icon={Radio} label="Infraestructura" color="amber" onClick={setTab} />
          <TabButton tab="ventas" current={tab} icon={TrendingUp} label="Ventas" color="violet" onClick={setTab} />
        </div>

        {/* Tab Content */}
        {tab === "financiero" && <FinancieroTab stats={financeStats} loading={loading} />}
        {tab === "soporte" && <SoporteTab />}
        {tab === "infraestructura" && <InfraestructuraTab overview={infraOverview} problems={infraProblems} hosts={infraHosts} loading={infraLoading} />}
        {tab === "ventas" && <VentasTab />}
      </div>
    </>
  );
}
