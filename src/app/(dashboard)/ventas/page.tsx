"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard";
import {
  TrendingUp, RefreshCw, Clock, Users, DollarSign,
  Target, UserPlus, ExternalLink, Zap, Trophy,
  ArrowRight, TicketCheck, Database, Filter,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface PipelineSummary {
  id: number; name: string; total_leads: number; active_leads: number;
  won: number; lost: number; created_today: number;
  pipeline_value: number; won_value: number; conversion_rate: number;
  by_stage: { status_id: number; stage: string; color: string; count: number; value: number }[];
}
interface Salesperson {
  id: number; name: string; leads_total: number; leads_won: number;
  leads_lost: number; pipeline_value: number; won_value: number; conversion_rate: number;
}
interface RecentLead {
  id: number; name: string; contact_name: string; pipeline_name: string;
  status_label: string; status_color: string; responsible: string;
  price: number; created_at: string; updated_at: string; is_won: boolean; is_lost: boolean;
}
interface VentasData {
  source: string; period: string; total_leads: number; active_leads: number;
  won: number; lost: number; created_today: number;
  pipeline_value: number; won_value: number; conversion_rate: number;
  pipelines: PipelineSummary[]; by_salesperson: Salesperson[];
  recent_leads: RecentLead[]; available_pipelines: { id: number; name: string }[];
  updated_at: string;
}

type MainTab = "kommo" | "crm";

// ============================================
// HELPERS
// ============================================
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

// ============================================
// MAIN PAGE
// ============================================
export default function VentasPage() {
  const [mainTab, setMainTab] = useState<MainTab>("kommo");
  const [data, setData] = useState<VentasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("30d");
  const [selectedPipeline, setSelectedPipeline] = useState<string>("all");

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ period });
      if (selectedPipeline !== "all") params.set("pipeline_id", selectedPipeline);
      const res = await fetch(`/api/ventas?${params}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (err) {
      console.error("Error fetching ventas:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, selectedPipeline]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <>
      <TopBar title="CRM Ventas" icon={<TrendingUp size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-2">
          <button onClick={() => setMainTab("kommo")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              mainTab === "kommo" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
            }`}>
            <ExternalLink size={16} /> Visor Kommo
          </button>
          <button onClick={() => setMainTab("crm")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              mainTab === "crm" ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20" : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
            }`}>
            <TicketCheck size={16} /> CRM Ventas
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20">Próximo</span>
          </button>
        </div>

        {mainTab === "kommo" && (
          <KommoVisor data={data} loading={loading} refreshing={refreshing}
            period={period} setPeriod={setPeriod}
            selectedPipeline={selectedPipeline} setSelectedPipeline={setSelectedPipeline}
            fetchData={fetchData} setRefreshing={setRefreshing} />
        )}
        {mainTab === "crm" && <CRMVentasPlaceholder />}
      </div>
    </>
  );
}

// ============================================
// VISOR KOMMO VENTAS
// ============================================
function KommoVisor({ data, loading, refreshing, period, setPeriod, selectedPipeline, setSelectedPipeline, fetchData, setRefreshing }: {
  data: VentasData | null; loading: boolean; refreshing: boolean;
  period: string; setPeriod: (p: string) => void;
  selectedPipeline: string; setSelectedPipeline: (p: string) => void;
  fetchData: () => Promise<void>; setRefreshing: (b: boolean) => void;
}) {
  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-500">
          <RefreshCw size={20} className="animate-spin" />
          <span>Conectando con Kommo Ventas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Source + Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <ExternalLink size={12} /> Kommo: wuipidrive
          </span>
          <span className="text-xs text-gray-500">{data.total_leads} leads</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Pipeline filter */}
          {data.available_pipelines.length > 1 && (
            <select value={selectedPipeline} onChange={e => setSelectedPipeline(e.target.value)}
              className="px-2 py-1 rounded-lg bg-wuipi-bg border border-wuipi-border text-xs text-gray-300 focus:outline-none">
              <option value="all">Todos los pipelines</option>
              {data.available_pipelines.map(p => <option key={p.id} value={p.id.toString()}>{p.name}</option>)}
            </select>
          )}
          {/* Period */}
          <span className="text-xs text-gray-600 mr-1">Período:</span>
          {([
            { key: "today", label: "Hoy" }, { key: "7d", label: "7d" },
            { key: "30d", label: "30d" }, { key: "90d", label: "90d" }, { key: "all", label: "Todo" },
          ] as const).map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                period === p.key ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-gray-500 hover:text-gray-300 border border-transparent"
              }`}>{p.label}</button>
          ))}
          <button onClick={() => { setRefreshing(true); fetchData(); }} disabled={refreshing}
            className="p-1.5 rounded-lg border border-wuipi-border text-gray-400 hover:text-white disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3">
        <Card className="flex flex-col items-center justify-center py-3">
          <ScoreRing score={data.conversion_rate} size={68} />
          <p className="text-xs font-semibold text-white mt-2">Conversión</p>
        </Card>
        <KPI icon={Target} label="Leads activos" value={data.active_leads} sub={`${data.created_today} nuevos hoy`} color="text-cyan-400" />
        <KPI icon={Trophy} label="Ganados" value={data.won} sub={fmtUSD(data.won_value)} color="text-emerald-400" />
        <KPI icon={DollarSign} label="Pipeline" value={fmtUSD(data.pipeline_value)} sub={`${data.active_leads} leads activos`} color="text-amber-400" />
        <KPI icon={Users} label="Perdidos" value={data.lost} sub={`${data.total_leads} total`} color="text-red-400" />
        <Card className="flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Clock size={12} /> Auto-refresh: 2m</div>
          <div className="text-xs text-gray-600">Pipelines: {data.pipelines.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Left: Pipelines + Recent */}
        <div className="col-span-2 space-y-4">
          {/* Pipeline stages */}
          {data.pipelines.map(pipeline => (
            <Card key={pipeline.id}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap size={16} /> {pipeline.name}
                </h3>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-400">{pipeline.won} ganados</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-gray-400">{pipeline.active_leads} activos</span>
                  <span className="text-gray-500">|</span>
                  <span className="text-amber-400">{fmtUSD(pipeline.pipeline_value)}</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {pipeline.by_stage.map(stage => (
                  <div key={stage.status_id} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-xs text-gray-300 w-36 truncate">{stage.stage}</span>
                    <div className="flex-1 h-2 bg-wuipi-bg rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        backgroundColor: stage.color,
                        width: `${Math.min(100, pipeline.active_leads > 0 ? (stage.count / pipeline.active_leads) * 100 : 0)}%`,
                        minWidth: stage.count > 0 ? "4px" : "0"
                      }} />
                    </div>
                    <span className="text-sm font-bold text-white w-8 text-right">{stage.count}</span>
                    <span className="text-[10px] text-gray-500 w-16 text-right">{fmtUSD(stage.value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {/* Recent leads */}
          <Card>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <UserPlus size={16} /> Leads Recientes
            </h3>
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {data.recent_leads.map(lead => (
                <div key={lead.id} className="p-3 rounded-lg bg-wuipi-bg border border-wuipi-border hover:border-emerald-500/20 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        lead.is_won ? "text-emerald-400 bg-emerald-400/10" : lead.is_lost ? "text-red-400 bg-red-400/10" : "text-gray-400 bg-gray-400/10"
                      }`}>
                        {lead.is_won ? "GANADO" : lead.is_lost ? "PERDIDO" : lead.status_label}
                      </span>
                      <span className="text-[10px] text-gray-600">{lead.pipeline_name}</span>
                    </div>
                    <span className="text-[10px] text-gray-600">{timeAgo(lead.updated_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-white truncate">{lead.name}</p>
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500">
                    <div className="flex items-center gap-3">
                      {lead.contact_name && <span>👤 {lead.contact_name}</span>}
                      <span>🔧 {lead.responsible}</span>
                    </div>
                    {lead.price > 0 && <span className="font-bold text-emerald-400">{fmtUSD(lead.price)}</span>}
                  </div>
                </div>
              ))}
              {data.recent_leads.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">No hay leads en este período</p>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Salesperson + Summary */}
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Trophy size={16} /> Rendimiento Vendedores
            </h3>
            <div className="space-y-3">
              {data.by_salesperson.map((sp, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
                return (
                  <div key={sp.id} className="p-3 bg-wuipi-bg border border-wuipi-border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{medal}</span>
                      <span className="text-sm font-semibold text-white flex-1 truncate">{sp.name}</span>
                      <span className={`text-xs font-bold ${sp.conversion_rate >= 30 ? "text-emerald-400" : sp.conversion_rate >= 15 ? "text-amber-400" : "text-red-400"}`}>
                        {sp.conversion_rate}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div><span className="text-gray-500">Total</span><p className="font-bold text-white">{sp.leads_total}</p></div>
                      <div><span className="text-gray-500">Ganados</span><p className="font-bold text-emerald-400">{sp.leads_won}</p></div>
                      <div><span className="text-gray-500">Valor</span><p className="font-bold text-amber-400">{fmtUSD(sp.won_value)}</p></div>
                    </div>
                  </div>
                );
              })}
              {data.by_salesperson.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">Sin datos de vendedores</p>
              )}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <DollarSign size={16} /> Resumen
            </h3>
            <div className="space-y-3">
              <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                <p className="text-xs text-gray-500">Valor del pipeline</p>
                <p className="text-2xl font-bold text-amber-400">{fmtUSD(data.pipeline_value)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                  <p className="text-xs text-gray-500">Ingresos cerrados</p>
                  <p className="text-xl font-bold text-emerald-400">{fmtUSD(data.won_value)}</p>
                </div>
                <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                  <p className="text-xs text-gray-500">Tasa conversión</p>
                  <p className={`text-xl font-bold ${data.conversion_rate >= 20 ? "text-emerald-400" : "text-amber-400"}`}>{data.conversion_rate}%</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================
// KPI Card
// ============================================
function KPI({ icon: Icon, label, value, sub, color = "text-white" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
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

// ============================================
// CRM VENTAS PLACEHOLDER
// ============================================
function CRMVentasPlaceholder() {
  const features = [
    { icon: Database, title: "Pipeline Propio", desc: "Lead → Contactado → Visita Técnica → Propuesta → Aprobado → Instalación" },
    { icon: Users, title: "Auto-crear Cliente", desc: "Al cerrar venta: crea cliente + primera factura + orden de instalación automáticamente" },
    { icon: Target, title: "Seguimiento", desc: "Actividades, llamadas, visitas — todo registrado y con recordatorios" },
    { icon: TrendingUp, title: "Reportes", desc: "Forecast, funnel analytics, rendimiento por vendedor y por zona" },
  ];

  return (
    <div className="space-y-4">
      <Card className="!p-0 overflow-hidden">
        <div className="h-1 bg-amber-400" />
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
              <TrendingUp size={24} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">CRM de Ventas Propio</h2>
              <p className="text-sm text-gray-400">Pipeline de ventas en Supabase — próxima fase</p>
            </div>
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
              Visor Kommo activo
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <Card key={i}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-wuipi-accent/10 border border-wuipi-accent/20 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-wuipi-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="!bg-emerald-500/5 border-emerald-500/10">
        <div className="flex items-start gap-3">
          <ExternalLink size={16} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Transición gradual desde Kommo</p>
            <p className="text-xs text-gray-400 mt-1">
              El Visor Kommo Ventas seguirá activo mientras se construye el CRM propio.
              Los datos históricos de Kommo se mantendrán como referencia.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
