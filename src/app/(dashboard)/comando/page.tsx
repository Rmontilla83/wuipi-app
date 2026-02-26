"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { KPICard } from "@/components/ui/kpi-card";
import { ScoreRing, StatusBadge } from "@/components/dashboard";
import {
  ZabbixBanner, AlertBanner, KPIRow, MapaSitios,
  ProblemasActivos, PeoresRed, DetalleEquipos,
} from "@/components/comando/infra";
import type { InfraOverview, InfraProblem, InfraHost } from "@/types/zabbix";
import {
  Target, DollarSign, Headphones, Radio, TrendingUp,
  RefreshCw, AlertTriangle, Clock,
  Activity, Zap,
  CreditCard, BarChart3, UserPlus,
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

interface TicketStats {
  total: number;
  open: number;
  in_progress: number;
  resolved_today: number;
  sla_breached: number;
  critical_active: number;
  active: number;
}

interface VentasStats {
  total: number;
  active: number;
  won: number;
  lost: number;
  pipeline_value: number;
  conversion_rate: number;
  created_this_week: number;
  created_this_month: number;
  won_this_month: number;
  by_stage: Record<string, { count: number; value: number }>;
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
function OverviewCards({ financeStats, infraOverview, ticketStats, ventasStats }: {
  financeStats: FinanceStats | null;
  infraOverview: InfraOverview | null;
  ticketStats: TicketStats | null;
  ventasStats: VentasStats | null;
}) {
  const infraScore = infraOverview?.healthScore ?? 0;
  const infraStatus = infraScore > 85 ? "operational" as const : infraScore > 60 ? "warning" as const : "critical" as const;

  // Soporte score: based on active tickets (lower = better)
  const soporteActive = ticketStats?.active ?? 0;
  const soporteScore = soporteActive === 0 ? 100 : Math.max(0, 100 - soporteActive * 5);
  const soporteStatus = soporteScore > 85 ? "operational" as const : soporteScore > 60 ? "warning" as const : "critical" as const;

  // Ventas: use conversion rate as score
  const ventasScore = ventasStats?.conversion_rate ?? 0;
  const ventasStatus = ventasScore > 20 ? "operational" as const : ventasScore > 10 ? "warning" as const : ventasScore === 0 && (ventasStats?.total ?? 0) === 0 ? "operational" as const : "critical" as const;

  const modules = [
    {
      label: "Finanzas", icon: "💰",
      score: financeStats ? (financeStats.invoices_this_month === 0 ? 100 : financeStats.collection_rate) : 0,
      status: financeStats
        ? (financeStats.invoices_this_month === 0 ? "operational" as const : financeStats.collection_rate > 85 ? "operational" as const : financeStats.collection_rate > 70 ? "warning" as const : "critical" as const)
        : "operational" as const,
      detail: financeStats ? (financeStats.invoices_this_month === 0 ? "Pendiente conexión con Odoo" : `$${financeStats.invoiced_usd.toLocaleString()} facturado`) : "Cargando...",
    },
    {
      label: "Soporte", icon: "🎧",
      score: soporteScore,
      status: soporteStatus,
      detail: ticketStats ? `${ticketStats.active} tickets activos` : "Cargando...",
    },
    {
      label: "Red", icon: "📡",
      score: infraScore,
      status: infraStatus,
      detail: infraOverview ? `${infraOverview.hostsUp}/${infraOverview.totalHosts} hosts online` : "Cargando...",
    },
    {
      label: "Ventas", icon: "📈",
      score: ventasScore,
      status: ventasStatus,
      detail: ventasStats ? `${ventasStats.created_this_week} leads esta semana` : "Cargando...",
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

  // Show Odoo pending banner when there's no invoicing data
  const hasInvoicingData = stats.invoices_this_month > 0 || stats.invoiced_usd > 0 || stats.invoiced_ves > 0;

  return (
    <div className="space-y-4">
      {!hasInvoicingData && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <DollarSign size={20} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Pendiente conexión con Odoo</p>
            <p className="text-xs text-gray-500 mt-0.5">La facturación detallada se gestionará desde Odoo. Los datos de clientes y cobros se mostrarán aquí una vez conectado.</p>
          </div>
        </div>
      )}

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
// TAB: SOPORTE (real data)
// ============================================
function SoporteTab({ stats }: { stats: TicketStats | null }) {
  if (!stats) return <LoadingPlaceholder />;

  if (stats.total === 0) {
    return (
      <Card>
        <div className="text-center py-16">
          <Headphones size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">Sin tickets registrados</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Los tickets se registran desde el módulo de Soporte
          </p>
        </div>
      </Card>
    );
  }

  // Compute SLA score: % of non-breached
  const slaScore = stats.total > 0 ? Math.round(((stats.total - stats.sla_breached) / stats.total) * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">
        <KPICard label="Total" value={stats.total.toString()} icon={Headphones} color="cyan" />
        <KPICard label="Abiertos" value={stats.open.toString()} icon={Clock} color="amber" />
        <KPICard label="En progreso" value={stats.in_progress.toString()} icon={Activity} color="blue" />
        <KPICard label="Resueltos hoy" value={stats.resolved_today.toString()} icon={Zap} color="emerald" />
        <KPICard label="SLA violado" value={stats.sla_breached.toString()} icon={AlertTriangle} color="red" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">📊 Rendimiento</h3>
          <div className="flex items-center justify-center mb-4">
            <ScoreRing score={slaScore} size={100} />
          </div>
          <p className="text-center text-sm text-gray-400">SLA cumplido</p>
          <div className="mt-4 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-xs text-gray-500">Tickets críticos activos</p>
            <p className={`text-xl font-bold ${stats.critical_active > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {stats.critical_active}
            </p>
          </div>
        </Card>

        <Card className="col-span-2">
          <h3 className="text-base font-bold text-white mb-4">📋 Resumen de Estado</h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Nuevos / Asignados" value={stats.open.toString()} color="text-amber-400" />
            <MiniStat label="En progreso" value={stats.in_progress.toString()} color="text-cyan-400" />
            <MiniStat label="Resueltos hoy" value={stats.resolved_today.toString()} color="text-emerald-400" />
            <MiniStat label="Tickets activos" value={stats.active.toString()} color="text-white" />
          </div>
          <div className="mt-4 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-xs text-gray-500">Datos detallados por categoría y técnico próximamente</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// TAB: INFRAESTRUCTURA (Zabbix-powered, executive dashboard)
// ============================================
function InfraestructuraTab({ overview, problems, hosts, loading }: {
  overview: InfraOverview | null;
  problems: InfraProblem[];
  hosts: InfraHost[];
  loading: boolean;
}) {
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  if (loading) return <LoadingPlaceholder />;

  return (
    <div className="space-y-6">
      {overview?.zabbixConnected === false && <ZabbixBanner />}
      <AlertBanner hosts={hosts} />
      <KPIRow overview={overview} hosts={hosts} />
      <MapaSitios
        sites={overview?.sites || []}
        problems={problems}
        selectedSite={selectedSite}
        onSelectSite={setSelectedSite}
      />
      <ProblemasActivos problems={problems} selectedSite={selectedSite} />
      <PeoresRed hosts={hosts} selectedSite={selectedSite} />
      <DetalleEquipos hosts={hosts} selectedSite={selectedSite} />
    </div>
  );
}

// ============================================
// TAB: VENTAS (real data)
// ============================================
function VentasTab({ stats }: { stats: VentasStats | null }) {
  if (!stats) return <LoadingPlaceholder />;

  if (stats.total === 0) {
    return (
      <Card>
        <div className="text-center py-16">
          <TrendingUp size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">Sin leads registrados</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Los leads se gestionan desde el módulo de Ventas
          </p>
        </div>
      </Card>
    );
  }

  const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Sorted pipeline stages for display
  const STAGE_ORDER = [
    "incoming", "contacto_inicial", "info_enviada", "en_instalacion",
    "prueba_actualizacion", "retirado_reactivacion", "ganado", "no_concretado", "no_factible", "no_clasificado",
  ];
  const STAGE_NAMES: Record<string, string> = {
    incoming: "Entrantes", contacto_inicial: "Contacto inicial", info_enviada: "Info enviada",
    en_instalacion: "Instalación", prueba_actualizacion: "Prueba/Upgrade", retirado_reactivacion: "Reactivación",
    ganado: "Ganados", no_concretado: "No concretados", no_factible: "No factibles", no_clasificado: "Sin clasificar",
  };
  const STAGE_COLORS: Record<string, string> = {
    incoming: "bg-blue-500", contacto_inicial: "bg-cyan-500", info_enviada: "bg-violet-500",
    en_instalacion: "bg-amber-500", prueba_actualizacion: "bg-indigo-500", retirado_reactivacion: "bg-orange-500",
    ganado: "bg-emerald-500", no_concretado: "bg-red-500", no_factible: "bg-gray-500", no_clasificado: "bg-gray-400",
  };

  const pipelineStages = STAGE_ORDER
    .filter(s => stats.by_stage[s])
    .map(s => ({
      stage: s,
      label: STAGE_NAMES[s] || s,
      count: stats.by_stage[s].count,
      value: stats.by_stage[s].value,
      color: STAGE_COLORS[s] || "bg-gray-500",
    }));

  const maxCount = Math.max(...pipelineStages.map(s => s.count), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Leads activos" value={stats.active.toString()} icon={UserPlus} color="cyan" />
        <KPICard label="Pipeline value" value={`$${fmt(stats.pipeline_value)}`} icon={DollarSign} color="emerald" />
        <KPICard label="Conversión" value={`${stats.conversion_rate}%`} icon={TrendingUp} color="violet" />
        <KPICard label="Ganados este mes" value={stats.won_this_month.toString()} icon={Zap} color="emerald" sub={`${stats.created_this_month} creados`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h3 className="text-base font-bold text-white mb-4">🔄 Pipeline por Etapa</h3>
          <div className="space-y-3">
            {pipelineStages.map((stage) => {
              const widthPct = Math.max((stage.count / maxCount) * 100, 15);
              return (
                <div key={stage.stage}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{stage.label}</span>
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

        <Card>
          <h3 className="text-base font-bold text-white mb-4">📊 Resumen</h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Total leads" value={stats.total.toString()} color="text-white" />
            <MiniStat label="Activos" value={stats.active.toString()} color="text-cyan-400" />
            <MiniStat label="Ganados" value={stats.won.toString()} color="text-emerald-400" />
            <MiniStat label="Perdidos" value={stats.lost.toString()} color="text-red-400" />
            <MiniStat label="Creados esta semana" value={stats.created_this_week.toString()} color="text-violet-400" />
            <MiniStat label="Ganados este mes" value={stats.won_this_month.toString()} color="text-emerald-400" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
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

  // Ticket + Ventas stats
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null);
  const [ventasStats, setVentasStats] = useState<VentasStats | null>(null);

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

  const loadTicketStats = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets/stats");
      if (res.ok) setTicketStats(await res.json());
    } catch (err) {
      console.error("Error loading ticket stats:", err);
    }
  }, []);

  const loadVentasStats = useCallback(async () => {
    try {
      const res = await fetch("/api/crm-ventas/stats");
      if (res.ok) setVentasStats(await res.json());
    } catch (err) {
      console.error("Error loading ventas stats:", err);
    }
  }, []);

  useEffect(() => {
    loadFinanceStats();
    loadInfraData();
    loadTicketStats();
    loadVentasStats();
    // Auto-refresh infra data every 60s
    const interval = setInterval(loadInfraData, 60000);
    return () => clearInterval(interval);
  }, [loadFinanceStats, loadInfraData, loadTicketStats, loadVentasStats]);

  const refreshAll = () => {
    loadFinanceStats();
    loadInfraData();
    loadTicketStats();
    loadVentasStats();
  };

  return (
    <>
      <TopBar
        title="Centro de Comando"
        icon={<Target size={22} />}
        actions={
          <button
            onClick={refreshAll}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white text-sm transition-colors"
          >
            <RefreshCw size={14} /> Actualizar
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Overview Cards — always visible */}
        <OverviewCards financeStats={financeStats} infraOverview={infraOverview} ticketStats={ticketStats} ventasStats={ventasStats} />

        {/* Tab Selector */}
        <div className="flex gap-2 border-b border-wuipi-border pb-3">
          <TabButton tab="financiero" current={tab} icon={DollarSign} label="Financiero" color="emerald" onClick={setTab} />
          <TabButton tab="soporte" current={tab} icon={Headphones} label="Soporte" color="cyan" onClick={setTab} />
          <TabButton tab="infraestructura" current={tab} icon={Radio} label="Infraestructura" color="amber" onClick={setTab} />
          <TabButton tab="ventas" current={tab} icon={TrendingUp} label="Ventas" color="violet" onClick={setTab} />
        </div>

        {/* Tab Content */}
        {tab === "financiero" && <FinancieroTab stats={financeStats} loading={loading} />}
        {tab === "soporte" && <SoporteTab stats={ticketStats} />}
        {tab === "infraestructura" && <InfraestructuraTab overview={infraOverview} problems={infraProblems} hosts={infraHosts} loading={infraLoading} />}
        {tab === "ventas" && <VentasTab stats={ventasStats} />}
      </div>
    </>
  );
}
