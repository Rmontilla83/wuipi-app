"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing, LoadBar } from "@/components/dashboard";
import {
  Headphones, RefreshCw, Clock, Users, AlertTriangle,
  Timer, User, Zap, Tag, ExternalLink, Filter,
} from "lucide-react";

// --- Types for real Kommo data ---
interface StageData {
  stage: string; status_id: number; count: number; color: string;
}
interface CategoryData {
  category: string; label: string; count: number; percentage: number;
}
interface TechData {
  id: string; name: string; tickets_total: number; tickets_resolved: number;
  tickets_open: number; sla_compliance: number;
}
interface TicketData {
  id: string; kommo_id: number; client_name: string; subject: string;
  category: string; category_label: string; priority: string;
  status: string; status_label: string; assigned_to: string;
  created_at: string; updated_at: string; closed_at: string | null;
}
interface SoporteData {
  source: string; pipeline: string; period: string; total_leads: number;
  tickets_today: number; tickets_open: number; tickets_in_progress: number;
  tickets_pending: number; tickets_resolved_today: number; tickets_resolved_period: number;
  active_tickets: number; visitas_l2c: number;
  total_contacts: number; repeat_clients: number; repeat_client_pct: number;
  by_stage: StageData[]; by_category: CategoryData[]; by_technician: TechData[];
  recent_tickets: TicketData[]; updated_at: string;
}

// --- Sub-components ---

function KPICard({ label, value, sub, icon: Icon, color = "text-white" }: {
  label: string; value: string | number; sub?: string; icon: any; color?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-gray-500" />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Card>
  );
}

function TicketRow({ ticket }: { ticket: TicketData }) {
  const priorityColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  const statusColors: Record<string, string> = {
    open: "bg-cyan-500/10 text-cyan-400",
    in_progress: "bg-amber-500/10 text-amber-400",
    pending: "bg-purple-500/10 text-purple-400",
    resolved: "bg-emerald-500/10 text-emerald-400",
    closed: "bg-gray-500/10 text-gray-400",
  };

  const timeAgo = (ts: string) => {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  return (
    <div className="p-3 rounded-lg bg-wuipi-bg border border-wuipi-border hover:border-wuipi-accent/20 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-500">{ticket.id}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColors[ticket.priority] || priorityColors.medium}`}>
            {ticket.priority === "critical" ? "CRIT" : ticket.priority === "high" ? "ALTO" : "MED"}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[ticket.status] || statusColors.open}`}>
            {ticket.status_label}
          </span>
        </div>
        <span className="text-[10px] text-gray-600">{timeAgo(ticket.updated_at)}</span>
      </div>
      <p className="text-sm font-medium text-white truncate">{ticket.subject || ticket.client_name}</p>
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
        <span>👤 {ticket.client_name}</span>
        <span>📋 {ticket.category_label}</span>
        <span>🔧 {ticket.assigned_to}</span>
      </div>
    </div>
  );
}

function StageBar({ stage }: { stage: StageData }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
      <span className="text-xs text-gray-300 w-32 truncate">{stage.stage}</span>
      <div className="flex-1 h-2 bg-wuipi-bg rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ backgroundColor: stage.color, width: `${Math.min(100, stage.count)}%`, minWidth: stage.count > 0 ? "4px" : "0" }} />
      </div>
      <span className="text-sm font-bold text-white w-10 text-right">{stage.count}</span>
    </div>
  );
}

function TechCard({ tech, rank }: { tech: TechData; rank: number }) {
  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `${rank + 1}.`;
  const resolutionRate = tech.tickets_total > 0 ? Math.round((tech.tickets_resolved / tech.tickets_total) * 100) : 0;
  return (
    <div className="p-3 bg-wuipi-bg border border-wuipi-border rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{medal}</span>
        <span className="text-sm font-semibold text-white flex-1 truncate">{tech.name}</span>
        <span className={`text-xs font-bold ${resolutionRate >= 80 ? "text-emerald-400" : resolutionRate >= 60 ? "text-amber-400" : "text-red-400"}`}>
          {resolutionRate}%
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <span className="text-gray-500">Total</span>
          <p className="font-bold text-white">{tech.tickets_total}</p>
        </div>
        <div>
          <span className="text-gray-500">Resueltos</span>
          <p className="font-bold text-emerald-400">{tech.tickets_resolved}</p>
        </div>
        <div>
          <span className="text-gray-500">Abiertos</span>
          <p className={`font-bold ${tech.tickets_open > 5 ? "text-red-400" : "text-amber-400"}`}>{tech.tickets_open}</p>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function SoportePage() {
  const [data, setData] = useState<SoporteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "critical">("all");
  const [period, setPeriod] = useState("30d");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/soporte?period=${period}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (err) {
      console.error("Error fetching support data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <>
        <TopBar title="CRM Soporte" icon={<Headphones size={22} />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw size={20} className="animate-spin" />
            <span>Conectando con Kommo...</span>
          </div>
        </div>
      </>
    );
  }

  const filteredTickets = data.recent_tickets.filter((t) => {
    if (ticketFilter === "open") return t.status === "open" || t.status === "in_progress";
    if (ticketFilter === "critical") return t.priority === "critical";
    return true;
  });

  const resolutionRate = data.total_leads > 0
    ? Math.round(((data.total_leads - data.active_tickets) / data.total_leads) * 100)
    : 0;

  const periodLabels: Record<string, string> = {
    today: "Hoy", "7d": "7 días", "30d": "30 días", "90d": "90 días", all: "Total",
  };
  const periodLabel = periodLabels[period] || period;
  const isToday = period === "today";

  return (
    <>
      <TopBar title="CRM Soporte" icon={<Headphones size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Source badge + Period selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
              <ExternalLink size={12} /> Kommo: {data.pipeline}
            </span>
            <span className="text-xs text-gray-500">{data.total_leads} leads</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 mr-1">Período:</span>
            {([
              { key: "today", label: "Hoy" },
              { key: "7d", label: "7 días" },
              { key: "30d", label: "30 días" },
              { key: "90d", label: "90 días" },
              { key: "all", label: "Todo" },
            ] as const).map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  period === p.key
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                    : "text-gray-500 hover:text-gray-300 border border-transparent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-6 gap-3">
          <Card className="flex flex-col items-center justify-center py-3">
            <ScoreRing score={resolutionRate} size={68} />
            <p className="text-xs font-semibold text-white mt-2">Resolución</p>
          </Card>
          <KPICard
            label={isToday ? "Tickets Hoy" : `Tickets ${periodLabel}`}
            value={data.total_leads}
            sub={`${data.tickets_resolved_period || data.tickets_resolved_today} resueltos${isToday ? "" : ` en ${periodLabel}`}`}
            icon={Headphones}
          />
          <KPICard
            label="Abiertos"
            value={data.tickets_open}
            sub={`${data.active_tickets} activos total`}
            icon={AlertTriangle}
            color="text-cyan-400"
          />
          <KPICard
            label="En Progreso"
            value={data.tickets_in_progress}
            sub={`${data.tickets_pending} pendientes`}
            icon={Timer}
            color="text-amber-400"
          />
          <KPICard
            label="Visitas L2C"
            value={data.visitas_l2c}
            sub={isToday ? "Soporte en cliente" : `En ${periodLabel}`}
            icon={Users}
            color="text-violet-400"
          />
          <Card className="flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Clock size={12} /> Auto-refresh: 60s
            </div>
            <button
              onClick={() => { setRefreshing(true); fetchData(); }}
              disabled={refreshing}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-xs font-semibold disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              Refrescar
            </button>
          </Card>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Left: Tickets + Categories */}
          <div className="col-span-2 space-y-4">
            {/* Tickets */}
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap size={18} /> Tickets Recientes
                </h3>
                <div className="flex gap-1">
                  {(["all", "open", "critical"] as const).map((f) => (
                    <button key={f} onClick={() => setTicketFilter(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        ticketFilter === f
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : "text-gray-500 hover:text-gray-300 border border-transparent"
                      }`}>
                      {f === "all" ? "Todos" : f === "open" ? "Abiertos" : "Críticos"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-auto">
                {filteredTickets.map((t) => <TicketRow key={t.id} ticket={t} />)}
                {filteredTickets.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-8">No hay tickets con este filtro</p>
                )}
              </div>
            </Card>

            {/* Categories + Pipeline stages */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Tag size={16} /> Clasificación por Tipo
                </h3>
                <div className="space-y-3">
                  {data.by_category.map((cat) => (
                    <div key={cat.category} className="flex items-center gap-3">
                      <span className="text-xs text-gray-300 w-24 truncate">{cat.label}</span>
                      <div className="flex-1 h-3 bg-wuipi-bg rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500/50 rounded-full" style={{ width: `${cat.percentage}%` }} />
                      </div>
                      <span className="text-xs font-bold text-white w-8 text-right">{cat.count}</span>
                      <span className="text-[10px] text-gray-500 w-10 text-right">{cat.percentage}%</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Filter size={16} /> Pipeline - Etapas
                </h3>
                <div className="space-y-3">
                  {data.by_stage.map((stage) => <StageBar key={stage.status_id} stage={stage} />)}
                </div>
              </Card>
            </div>
          </div>

          {/* Right column: Technicians + Clients */}
          <div className="space-y-4">
            <Card>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <User size={16} /> Rendimiento Equipo
              </h3>
              <div className="space-y-3">
                {data.by_technician
                  .sort((a, b) => b.sla_compliance - a.sla_compliance)
                  .map((tech, i) => <TechCard key={tech.id} tech={tech} rank={i} />)}
                {data.by_technician.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">Sin datos de técnicos</p>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Users size={16} /> Métricas de Clientes
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                  <p className="text-xs text-gray-500">Contactos únicos</p>
                  <p className="text-2xl font-bold text-white">{data.total_contacts.toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-xs text-gray-500">Tickets {isToday ? "hoy" : periodLabel}</p>
                    <p className="text-xl font-bold text-cyan-400">{data.total_leads}</p>
                  </div>
                  <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-xs text-gray-500">Reincidentes</p>
                    <p className="text-xl font-bold text-red-400">{data.repeat_clients}</p>
                  </div>
                </div>
                {data.repeat_client_pct > 10 && (
                  <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <p className="text-xs text-red-400 font-semibold mb-1">⚠ Tasa de reincidencia</p>
                    <p className="text-lg font-bold text-red-400">{data.repeat_client_pct}%</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {data.repeat_clients} clientes contactaron más de una vez
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
