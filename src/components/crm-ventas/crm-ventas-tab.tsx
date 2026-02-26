"use client";

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Card } from "@/components/ui/card";
import {
  Plus, Search, RefreshCw, LayoutGrid, List, Target,
  Trophy, DollarSign, Users, TrendingUp, Filter,
} from "lucide-react";
import KanbanBoard, { STAGES, STAGE_MAP, type CrmLead } from "./kanban-board";
import CreateLeadModal, { EMPTY_LEAD_FORM } from "./create-lead-modal";
import LeadDetail from "./lead-detail";
import QuotaDashboard from "./quota-dashboard";

interface Product { id: string; name: string; category: string; base_price: number; }
interface Salesperson { id: string; full_name: string; type: string; }

type ViewMode = "kanban" | "table";

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp", web: "Web", referido: "Referido", social: "Social", other: "Otro",
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function CRMVentasTab() {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterSalesperson, setFilterSalesperson] = useState("all");
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_LEAD_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterStage !== "all") params.set("stage", filterStage);
      if (filterSalesperson !== "all") params.set("salesperson_id", filterSalesperson);
      if (filterProduct !== "all") params.set("product_id", filterProduct);
      if (filterSource !== "all") params.set("source", filterSource);
      params.set("limit", "500");
      const res = await fetch(`/api/crm-ventas/leads?${params}`);
      const json = await res.json();
      setLeads(json.data || []);
      setTotal(json.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [debouncedSearch, filterStage, filterSalesperson, filterProduct, filterSource]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchLeads, 120000);
    return () => clearInterval(interval);
  }, [fetchLeads]);

  // Load products + salespeople on mount
  useEffect(() => {
    fetch("/api/crm-ventas/products").then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/crm-ventas/salespeople").then(r => r.json()).then(d => setSalespeople(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const setCreateField = (k: string, v: any) => setCreateForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!createForm.name.trim()) { setCreateError("El nombre es obligatorio"); return; }
    setCreateSaving(true); setCreateError("");
    try {
      const body: any = { ...createForm };
      if (!body.product_id) delete body.product_id;
      if (!body.salesperson_id) delete body.salesperson_id;
      if (!body.document_type) delete body.document_type;
      if (!body.document_number) delete body.document_number;
      body.value = parseFloat(body.value) || 0;
      // Clean empty strings to null
      for (const k of ["phone", "email", "address", "city", "state", "sector", "nodo", "notes"]) {
        if (!body[k]) body[k] = null;
      }
      const res = await fetch("/api/crm-ventas/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Error"); }
      setShowCreateModal(false); setCreateForm(EMPTY_LEAD_FORM); fetchLeads();
    } catch (err: any) { setCreateError(err.message); }
    finally { setCreateSaving(false); }
  };

  // Drag handlers
  const moveLead = async (leadId: string, newStage: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.stage === newStage) return;
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));
    try {
      await fetch(`/api/crm-ventas/leads/${leadId}/move`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      // Refetch to get updated data (e.g. client_id after ganado)
      fetchLeads();
    } catch {
      fetchLeads(); // revert on error
    }
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
    setDraggingId(leadId);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>, colKey: string) => {
    e.preventDefault();
    setDragOverCol(colKey);
  };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = (e: DragEvent<HTMLDivElement>, colKey: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    if (leadId) moveLead(leadId, colKey);
    setDraggingId(null);
    setDragOverCol(null);
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverCol(null); };

  // Stats
  const activeLeads = leads.filter(l => !["ganado", "no_concretado", "no_factible"].includes(l.stage));
  const wonLeads = leads.filter(l => l.stage === "ganado");
  const lostLeads = leads.filter(l => l.stage === "no_concretado");
  const pipelineValue = activeLeads.reduce((s, l) => s + (l.value || 0), 0);
  const wonValue = wonLeads.reduce((s, l) => s + (l.value || 0), 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Total Leads</p>
          <p className="text-xl font-bold text-white">{total}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Activos</p>
          <p className="text-xl font-bold text-cyan-400">{activeLeads.length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Ganados</p>
          <p className="text-xl font-bold text-emerald-400">{wonLeads.length}</p>
          <p className="text-[10px] text-gray-600">{fmtUSD(wonValue)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Pipeline</p>
          <p className="text-xl font-bold text-amber-400">{fmtUSD(pipelineValue)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Perdidos</p>
          <p className="text-xl font-bold text-red-400">{lostLeads.length}</p>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, código, teléfono..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
        </div>

        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Etapa: Todas</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <select value={filterSalesperson} onChange={e => setFilterSalesperson(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Vendedor: Todos</option>
          {salespeople.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>

        <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Producto: Todos</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Fuente: Todas</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="web">Web</option>
          <option value="referido">Referido</option>
          <option value="social">Social</option>
          <option value="other">Otro</option>
        </select>

        {/* View toggle */}
        <div className="flex items-center border border-wuipi-border rounded-lg overflow-hidden">
          <button onClick={() => setViewMode("kanban")}
            className={`p-2 ${viewMode === "kanban" ? "bg-wuipi-accent/10 text-wuipi-accent" : "text-gray-500 hover:text-gray-300"}`}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode("table")}
            className={`p-2 ${viewMode === "table" ? "bg-wuipi-accent/10 text-wuipi-accent" : "text-gray-500 hover:text-gray-300"}`}>
            <List size={16} />
          </button>
        </div>

        <button onClick={fetchLeads} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <button onClick={() => { setCreateForm(EMPTY_LEAD_FORM); setCreateError(""); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:bg-wuipi-accent/90 transition-colors">
          <Plus size={16} /> Nuevo Lead
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      ) : leads.length === 0 ? (
        <Card className="text-center py-12">
          <TrendingUp size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-sm mb-1">No hay leads</p>
          <p className="text-gray-600 text-xs">Crea el primer lead con el botón &quot;Nuevo Lead&quot;</p>
        </Card>
      ) : viewMode === "kanban" ? (
        <KanbanBoard leads={leads} draggingId={draggingId} dragOverCol={dragOverCol}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onDrop={onDrop} onDragEnd={onDragEnd} onClickLead={(l) => setSelectedLeadId(l.id)} />
      ) : (
        <TableView leads={leads} onClickLead={(l) => setSelectedLeadId(l.id)} />
      )}

      {/* Quota dashboard */}
      <QuotaDashboard />

      {/* Create modal */}
      {showCreateModal && (
        <CreateLeadModal form={createForm} setField={setCreateField} products={products}
          salespeople={salespeople} error={createError} saving={createSaving}
          onSave={handleCreate} onClose={() => setShowCreateModal(false)} />
      )}

      {/* Lead detail */}
      {selectedLeadId && (
        <LeadDetail leadId={selectedLeadId} products={products} salespeople={salespeople}
          onClose={() => setSelectedLeadId(null)} onUpdated={fetchLeads} />
      )}
    </div>
  );
}

// ============================================
// TABLE VIEW
// ============================================
function TableView({ leads, onClickLead }: { leads: CrmLead[]; onClickLead: (l: CrmLead) => void }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-wuipi-border">
              <th className="text-left p-3 pl-4 font-medium">Código</th>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">Producto</th>
              <th className="text-center p-3 font-medium">Etapa</th>
              <th className="text-left p-3 font-medium">Vendedor</th>
              <th className="text-left p-3 font-medium">Fuente</th>
              <th className="text-right p-3 font-medium">Valor</th>
              <th className="text-right p-3 pr-4 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const st = STAGE_MAP[lead.stage] || STAGES[0];
              return (
                <tr key={lead.id} onClick={() => onClickLead(lead)}
                  className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer">
                  <td className="p-3 pl-4 font-mono text-gray-300 text-xs">{lead.code}</td>
                  <td className="p-3">
                    <p className="text-white font-medium truncate max-w-[250px]">{lead.name}</p>
                    <p className="text-gray-600 text-xs">{lead.phone || lead.email || ""}</p>
                  </td>
                  <td className="p-3 text-gray-300 text-xs truncate max-w-[150px]">{lead.crm_products?.name || "—"}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.text} ${st.bg}`}>{st.label}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-400">{lead.crm_salespeople?.full_name || "Sin asignar"}</td>
                  <td className="p-3 text-xs text-gray-500">{SOURCE_LABELS[lead.source] || lead.source}</td>
                  <td className="p-3 text-right text-xs font-bold text-emerald-400">{lead.value > 0 ? fmtUSD(lead.value) : "—"}</td>
                  <td className="p-3 pr-4 text-right text-xs text-gray-500">{timeAgo(lead.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
