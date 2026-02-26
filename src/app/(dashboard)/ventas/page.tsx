"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard";
import {
  TrendingUp, RefreshCw, Clock, Users, DollarSign,
  Target, UserPlus, ExternalLink, Zap, Trophy,
  ArrowRight, TicketCheck, Database, Filter,
  ShoppingCart, Banknote,
} from "lucide-react";
import CRMVentasTab from "@/components/crm-ventas/crm-ventas-tab";

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
  pipeline_id: number;
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
type EmbudoTab = "all" | "ventas" | "cobranzas";

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

// Heuristic to classify pipelines as "ventas" or "cobranzas"
// Adjust these keywords based on your actual pipeline names in Kommo
const COBRANZAS_KEYWORDS = ["cobr", "collect", "pago", "deuda", "mora", "recaudo"];
function classifyPipeline(name: string): "ventas" | "cobranzas" {
  const lower = name.toLowerCase();
  return COBRANZAS_KEYWORDS.some(kw => lower.includes(kw)) ? "cobranzas" : "ventas";
}

// ============================================
// MAIN PAGE
// ============================================
export default function VentasPage() {
  const [mainTab, setMainTab] = useState<MainTab>("kommo");
  const [data, setData] = useState<VentasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("30d");

  // Fetch ALL pipelines (no pipeline_id filter — we filter client-side by embudo tab)
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ period });
      const res = await fetch(`/api/ventas?${params}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error + (json.details ? `: ${json.details}` : ""));
      } else {
        setData(json);
      }
    } catch (err) {
      console.error("Error fetching ventas:", err);
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

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
        {/* Main Tabs */}
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
          </button>
        </div>

        {mainTab === "kommo" && (
          <KommoVisor
            data={data} loading={loading} error={error} refreshing={refreshing}
            period={period} setPeriod={setPeriod}
            fetchData={fetchData} setRefreshing={setRefreshing}
          />
        )}
        {mainTab === "crm" && <CRMVentasTab />}
      </div>
    </>
  );
}

// ============================================
// VISOR KOMMO VENTAS — con sub-tabs Ventas / Cobranzas
// ============================================
function KommoVisor({ data, loading, error, refreshing, period, setPeriod, fetchData, setRefreshing }: {
  data: VentasData | null; loading: boolean; error: string | null; refreshing: boolean;
  period: string; setPeriod: (p: string) => void;
  fetchData: () => Promise<void>; setRefreshing: (b: boolean) => void;
}) {
  const [embudoTab, setEmbudoTab] = useState<EmbudoTab>("all");

  // Classify pipelines into ventas / cobranzas
  const pipelineClassification = useMemo(() => {
    if (!data) return new Map<number, "ventas" | "cobranzas">();
    const map = new Map<number, "ventas" | "cobranzas">();
    data.available_pipelines.forEach(p => map.set(p.id, classifyPipeline(p.name)));
    return map;
  }, [data]);

  // Filter data based on embudo tab
  const filteredData = useMemo(() => {
    if (!data || embudoTab === "all") return data;

    const targetPipelineIds = new Set(
      data.available_pipelines
        .filter(p => pipelineClassification.get(p.id) === embudoTab)
        .map(p => p.id)
    );

    const filteredPipelines = data.pipelines.filter(p => targetPipelineIds.has(p.id));
    const filteredLeads = data.recent_leads.filter(l => targetPipelineIds.has(l.pipeline_id));

    // Recalculate KPIs from filtered pipelines
    const active = filteredPipelines.reduce((s, p) => s + p.active_leads, 0);
    const won = filteredPipelines.reduce((s, p) => s + p.won, 0);
    const lost = filteredPipelines.reduce((s, p) => s + p.lost, 0);
    const total = filteredPipelines.reduce((s, p) => s + p.total_leads, 0);
    const pipelineValue = filteredPipelines.reduce((s, p) => s + p.pipeline_value, 0);
    const wonValue = filteredPipelines.reduce((s, p) => s + p.won_value, 0);
    const createdToday = filteredPipelines.reduce((s, p) => s + p.created_today, 0);

    // Recalculate salesperson stats from filtered pipelines
    // (We approximate — in a full impl we'd re-aggregate from raw leads)
    const filteredSalesperson = data.by_salesperson; // keep all for now

    return {
      ...data,
      total_leads: total,
      active_leads: active,
      won,
      lost,
      created_today: createdToday,
      pipeline_value: pipelineValue,
      won_value: wonValue,
      conversion_rate: total > 0 ? Math.round((won / total) * 1000) / 10 : 0,
      pipelines: filteredPipelines,
      recent_leads: filteredLeads,
    } as VentasData;
  }, [data, embudoTab, pipelineClassification]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-500">
          <RefreshCw size={20} className="animate-spin" />
          <span>Conectando con Kommo Ventas...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <Zap size={24} className="text-red-400" />
          </div>
          <p className="text-sm text-red-400 font-medium">Error al conectar con Kommo Ventas</p>
          <p className="text-xs text-gray-500 max-w-md">{error || "No se recibieron datos"}</p>
          <button onClick={() => { setRefreshing(true); fetchData(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-wuipi-card border border-wuipi-border text-gray-300 hover:bg-wuipi-card-hover transition-colors">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const displayData = filteredData || data;

  // Count pipelines per category
  const ventasCount = data.available_pipelines.filter(p => pipelineClassification.get(p.id) === "ventas").length;
  const cobranzasCount = data.available_pipelines.filter(p => pipelineClassification.get(p.id) === "cobranzas").length;

  return (
    <div className="space-y-4">
      {/* Source + Embudo Tabs + Period Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <ExternalLink size={12} /> Kommo: wuipidrive
          </span>
          <span className="text-xs text-gray-500">{displayData.total_leads} leads</span>

          {/* Embudo sub-tabs */}
          <div className="flex items-center ml-3 bg-wuipi-bg rounded-lg border border-wuipi-border p-0.5">
            <button onClick={() => setEmbudoTab("all")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                embudoTab === "all" ? "bg-wuipi-card text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
              }`}>
              Todos ({data.available_pipelines.length})
            </button>
            <button onClick={() => setEmbudoTab("ventas")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                embudoTab === "ventas" ? "bg-emerald-500/15 text-emerald-400 shadow-sm" : "text-gray-500 hover:text-gray-300"
              }`}>
              <ShoppingCart size={12} /> Ventas {ventasCount > 0 && `(${ventasCount})`}
            </button>
            <button onClick={() => setEmbudoTab("cobranzas")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                embudoTab === "cobranzas" ? "bg-amber-500/15 text-amber-400 shadow-sm" : "text-gray-500 hover:text-gray-300"
              }`}>
              <Banknote size={12} /> Cobranzas {cobranzasCount > 0 && `(${cobranzasCount})`}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Empty state for filtered view */}
      {displayData.pipelines.length === 0 && (
        <Card className="!bg-amber-500/5 border-amber-500/10">
          <div className="flex items-center gap-3 p-2">
            <Filter size={18} className="text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-400">
                No hay pipelines de {embudoTab === "ventas" ? "Ventas" : "Cobranzas"} detectados
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Los pipelines se clasifican automáticamente por nombre. Si no se detecta correctamente,
                verifica que el nombre del pipeline en Kommo contenga palabras clave como
                {embudoTab === "cobranzas" ? ' "cobranza", "pago", "mora", "deuda"' : ' "venta", o cualquier otro nombre'}.
              </p>
            </div>
          </div>
        </Card>
      )}

      {displayData.pipelines.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-6 gap-3">
            <Card className="flex flex-col items-center justify-center py-3">
              <ScoreRing score={displayData.conversion_rate} size={68} />
              <p className="text-xs font-semibold text-white mt-2">Conversión</p>
            </Card>
            <KPI icon={Target} label="Leads activos" value={displayData.active_leads} sub={`${displayData.created_today} nuevos hoy`} color="text-cyan-400" />
            <KPI icon={Trophy} label="Ganados" value={displayData.won} sub={fmtUSD(displayData.won_value)} color="text-emerald-400" />
            <KPI icon={DollarSign} label="Pipeline" value={fmtUSD(displayData.pipeline_value)} sub={`${displayData.active_leads} leads activos`} color="text-amber-400" />
            <KPI icon={Users} label="Perdidos" value={displayData.lost} sub={`${displayData.total_leads} total`} color="text-red-400" />
            <Card className="flex flex-col justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Clock size={12} /> Auto-refresh: 2m</div>
              <div className="text-xs text-gray-600">
                Pipelines: {displayData.pipelines.length}
                {embudoTab !== "all" && <span className="ml-1 text-gray-500">({embudoTab})</span>}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">Período: {period}</div>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Left: Pipelines + Recent */}
            <div className="col-span-2 space-y-4">
              {/* Pipeline stages */}
              {displayData.pipelines.map(pipeline => (
                <Card key={pipeline.id}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {pipelineClassification.get(pipeline.id) === "cobranzas"
                        ? <Banknote size={16} className="text-amber-400" />
                        : <Zap size={16} />
                      }
                      {pipeline.name}
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        pipelineClassification.get(pipeline.id) === "cobranzas"
                          ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                          : "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                      }`}>
                        {pipelineClassification.get(pipeline.id)}
                      </span>
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
                  {embudoTab !== "all" && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      embudoTab === "cobranzas" ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"
                    }`}>
                      {embudoTab}
                    </span>
                  )}
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-auto">
                  {displayData.recent_leads.map(lead => (
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
                  {displayData.recent_leads.length === 0 && (
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
                  {displayData.by_salesperson.map((sp, i) => {
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
                  {displayData.by_salesperson.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">Sin datos de vendedores</p>
                  )}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <DollarSign size={16} /> Resumen
                  {embudoTab !== "all" && (
                    <span className="text-[10px] text-gray-500 font-normal ml-1">({embudoTab})</span>
                  )}
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-xs text-gray-500">Valor del pipeline</p>
                    <p className="text-2xl font-bold text-amber-400">{fmtUSD(displayData.pipeline_value)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                      <p className="text-xs text-gray-500">Ingresos cerrados</p>
                      <p className="text-xl font-bold text-emerald-400">{fmtUSD(displayData.won_value)}</p>
                    </div>
                    <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                      <p className="text-xs text-gray-500">Tasa conversión</p>
                      <p className={`text-xl font-bold ${displayData.conversion_rate >= 20 ? "text-emerald-400" : "text-amber-400"}`}>{displayData.conversion_rate}%</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
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

