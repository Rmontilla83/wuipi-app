"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing, LoadBar } from "@/components/dashboard";
import type { SupportOverview, Ticket, TechnicianStats, ZoneStats, CategoryStats } from "@/types/support";
import { CATEGORY_LABELS, CATEGORY_COLORS, STATUS_LABELS, PRIORITY_LABELS } from "@/types/support";
import {
  Headphones, RefreshCw, Clock, Users, AlertTriangle, CheckCircle,
  Timer, Star, MapPin, Tag, ChevronDown, ChevronUp, User, Zap,
} from "lucide-react";

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

function TicketRow({ ticket }: { ticket: Ticket }) {
  const priorityColors = {
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };
  const statusColors = {
    open: "bg-cyan-500/10 text-cyan-400",
    in_progress: "bg-amber-500/10 text-amber-400",
    pending: "bg-violet-500/10 text-violet-400",
    resolved: "bg-emerald-500/10 text-emerald-400",
    closed: "bg-gray-500/10 text-gray-400",
  };

  const timeAgo = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  return (
    <div className="p-3 bg-wuipi-bg border border-wuipi-border rounded-xl hover:border-wuipi-accent/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-500">{ticket.id}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${priorityColors[ticket.priority]}`}>
              {PRIORITY_LABELS[ticket.priority]}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[ticket.status]}`}>
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <p className="text-sm text-white leading-tight truncate">{ticket.subject}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User size={10} /> {ticket.client_name}
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={10} /> {ticket.zone}
            </span>
            <span className="flex items-center gap-1">
              <Tag size={10} /> {CATEGORY_LABELS[ticket.category]}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500">{timeAgo(ticket.created_at)}</p>
          {ticket.technician_name && (
            <p className="text-[10px] text-gray-600 mt-1">→ {ticket.technician_name}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TechCard({ tech, rank }: { tech: TechnicianStats; rank: number }) {
  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : "";
  return (
    <div className="p-3 bg-wuipi-bg border border-wuipi-border rounded-xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center text-sm font-bold text-white border border-wuipi-border">
          {tech.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{medal} {tech.name}</p>
          <p className="text-xs text-gray-500">{tech.tickets_total} tickets · {tech.tickets_open} abiertos</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-xs text-gray-500">Resolución</p>
          <p className={`text-sm font-bold ${tech.avg_resolution_hours <= 2 ? "text-emerald-400" : tech.avg_resolution_hours <= 3 ? "text-amber-400" : "text-red-400"}`}>
            {tech.avg_resolution_hours}h
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">SLA</p>
          <p className={`text-sm font-bold ${tech.sla_compliance >= 90 ? "text-emerald-400" : tech.sla_compliance >= 75 ? "text-amber-400" : "text-red-400"}`}>
            {tech.sla_compliance}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Satisf.</p>
          <p className="text-sm font-bold text-amber-400 flex items-center justify-center gap-0.5">
            <Star size={11} fill="currentColor" /> {tech.satisfaction_score}
          </p>
        </div>
      </div>
    </div>
  );
}

function CategoryBar({ cat }: { cat: CategoryStats }) {
  const color = CATEGORY_COLORS[cat.category];
  const trendIcon = cat.trend === "up" ? "↑" : cat.trend === "down" ? "↓" : "→";
  const trendColor = cat.trend === "up" ? "text-red-400" : cat.trend === "down" ? "text-emerald-400" : "text-gray-500";
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-gray-400 truncate">{cat.label}</div>
      <div className="flex-1 h-5 bg-wuipi-bg rounded-full overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${cat.percentage}%`, backgroundColor: color }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80">
          {cat.count}
        </span>
      </div>
      <div className="w-10 text-right">
        <span className={`text-xs font-semibold ${trendColor}`}>{trendIcon}</span>
      </div>
      <div className="w-12 text-right text-xs text-gray-500">{cat.avg_resolution_hours}h</div>
    </div>
  );
}

function ZoneRow({ zone }: { zone: ZoneStats }) {
  const severity = zone.tickets_open > 5 ? "text-red-400" : zone.tickets_open > 2 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="p-3 bg-wuipi-bg border border-wuipi-border rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-white">{zone.zone}</span>
        <span className={`text-xs font-bold ${severity}`}>{zone.tickets_open} abiertos</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Total</span>
          <p className="font-bold text-white">{zone.tickets_total}</p>
        </div>
        <div>
          <span className="text-gray-500">Resol.</span>
          <p className="font-bold text-emerald-400">{zone.avg_resolution_hours}h</p>
        </div>
        <div>
          <span className="text-gray-500">Clientes</span>
          <p className="font-bold text-white">{zone.clients_affected}</p>
        </div>
        <div>
          <span className="text-gray-500">Reincid.</span>
          <p className={`font-bold ${zone.repeat_clients > 5 ? "text-red-400" : "text-gray-400"}`}>{zone.repeat_clients}</p>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function SoportePage() {
  const [data, setData] = useState<SupportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<"all" | "open" | "critical">("all");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/soporte");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error fetching support data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <>
        <TopBar title="Soporte" icon={<Headphones size={22} />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw size={20} className="animate-spin" />
            <span>Cargando datos de soporte...</span>
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

  return (
    <>
      <TopBar title="Soporte" icon={<Headphones size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* KPI Row */}
        <div className="grid grid-cols-6 gap-3">
          <Card className="flex flex-col items-center justify-center py-3">
            <ScoreRing score={Math.round(data.sla.compliance_rate)} size={68} />
            <p className="text-xs font-semibold text-white mt-2">SLA</p>
          </Card>
          <KPICard label="Tickets Hoy" value={data.tickets_today} sub={`${data.tickets_resolved_today} resueltos`} icon={Headphones} color="text-white" />
          <KPICard label="Abiertos" value={data.tickets_open} sub={`${data.tickets_unassigned} sin asignar`} icon={AlertTriangle} color="text-cyan-400" />
          <KPICard label="Tiempo Prom." value={`${data.sla.avg_resolution_hours}h`} sub={`Respuesta: ${data.sla.avg_first_response_minutes}min`} icon={Timer} color="text-amber-400" />
          <KPICard label="Clientes Hoy" value={data.unique_clients_today} sub={`${data.repeat_clients} reincidentes (${data.repeat_client_pct}%)`} icon={Users} color="text-white" />
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

        {/* Main grid: Tickets + Right column */}
        <div className="grid grid-cols-3 gap-4">
          {/* Tickets list - 2 cols */}
          <div className="col-span-2 space-y-4">
            {/* Tickets */}
            <Card>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap size={18} /> Tickets Recientes
                </h3>
                <div className="flex gap-1">
                  {(["all", "open", "critical"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTicketFilter(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        ticketFilter === f
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : "text-gray-500 hover:text-gray-300 border border-transparent"
                      }`}
                    >
                      {f === "all" ? "Todos" : f === "open" ? "Abiertos" : "Críticos"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {filteredTickets.map((t) => (
                  <TicketRow key={t.id} ticket={t} />
                ))}
                {filteredTickets.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-8">No hay tickets con este filtro</p>
                )}
              </div>
            </Card>

            {/* Categories + Zones */}
            <div className="grid grid-cols-2 gap-4">
              {/* Categories */}
              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Tag size={16} /> Clasificación por Tipo
                </h3>
                <div className="space-y-2.5">
                  {data.by_category.map((cat) => (
                    <CategoryBar key={cat.category} cat={cat} />
                  ))}
                </div>
                <div className="flex justify-between mt-3 text-[10px] text-gray-600 px-1">
                  <span>Categoría</span>
                  <span>Cantidad · Tendencia · Resolución</span>
                </div>
              </Card>

              {/* Zones */}
              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <MapPin size={16} /> Incidencias por Zona
                </h3>
                <div className="space-y-2">
                  {data.by_zone
                    .sort((a, b) => b.tickets_open - a.tickets_open)
                    .map((zone) => (
                      <ZoneRow key={zone.zone} zone={zone} />
                    ))}
                </div>
              </Card>
            </div>
          </div>

          {/* Right column: Technicians + Client metrics */}
          <div className="space-y-4">
            {/* Technicians */}
            <Card>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <User size={16} /> Rendimiento Técnicos
              </h3>
              <div className="space-y-3">
                {data.by_technician
                  .sort((a, b) => a.avg_resolution_hours - b.avg_resolution_hours)
                  .map((tech, i) => (
                    <TechCard key={tech.id} tech={tech} rank={i} />
                  ))}
              </div>
            </Card>

            {/* Client metrics */}
            <Card>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Users size={16} /> Métricas de Clientes
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                  <p className="text-xs text-gray-500">Clientes atendidos (total)</p>
                  <p className="text-2xl font-bold text-white">{data.total_clients_affected.toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-xs text-gray-500">Únicos hoy</p>
                    <p className="text-xl font-bold text-cyan-400">{data.unique_clients_today}</p>
                  </div>
                  <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-xs text-gray-500">Reincidentes</p>
                    <p className="text-xl font-bold text-red-400">{data.repeat_clients}</p>
                  </div>
                </div>
                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <p className="text-xs text-red-400 font-semibold mb-1">⚠ Tasa de reincidencia</p>
                  <p className="text-lg font-bold text-red-400">{data.repeat_client_pct}%</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {data.repeat_clients} clientes contactaron más de una vez hoy
                  </p>
                </div>
              </div>
            </Card>

            {/* SLA Breakdown */}
            <Card>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <CheckCircle size={16} /> Desglose SLA
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">Dentro de SLA</span>
                  <span className="text-sm font-bold text-emerald-400">{data.sla.within_sla}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">SLA incumplido</span>
                  <span className="text-sm font-bold text-red-400">{data.sla.breached_sla}</span>
                </div>
                <LoadBar value={data.sla.compliance_rate} />
                <p className="text-[10px] text-gray-600 text-center">
                  {data.sla.compliance_rate}% cumplimiento · Meta: 90%
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
