"use client";

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { Card } from "@/components/ui/card";
import {
  Plus, Search, RefreshCw, LayoutGrid, List,
  Banknote, DollarSign, Users, TrendingUp, AlertTriangle,
} from "lucide-react";
import KanbanBoard, { STAGES, STAGE_MAP, type CrmCollection } from "./kanban-board";
import CreateCollectionModal, { EMPTY_COLLECTION_FORM } from "./create-collection-modal";
import CollectionDetail from "./collection-detail";
import QuotaDashboard from "./quota-dashboard";

interface Collector { id: string; full_name: string; type: string; }

type ViewMode = "kanban" | "table";

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function CRMCobranzasTab() {
  const [collections, setCollections] = useState<CrmCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterCollector, setFilterCollector] = useState("all");
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_COLLECTION_FORM);
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

  const fetchCollections = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterStage !== "all") params.set("stage", filterStage);
      if (filterCollector !== "all") params.set("collector_id", filterCollector);
      params.set("limit", "500");
      const res = await fetch(`/api/crm-cobranzas/cases?${params}`);
      const json = await res.json();
      setCollections(json.data || []);
      setTotal(json.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [debouncedSearch, filterStage, filterCollector]);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchCollections, 120000);
    return () => clearInterval(interval);
  }, [fetchCollections]);

  // Load collectors on mount
  useEffect(() => {
    fetch("/api/crm-cobranzas/collectors").then(r => r.json()).then(d => setCollectors(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const setCreateField = (k: string, v: any) => setCreateForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!createForm.client_name.trim()) { setCreateError("El nombre del cliente es obligatorio"); return; }
    if (!createForm.client_id) { setCreateError("Debe seleccionar un cliente"); return; }
    setCreateSaving(true); setCreateError("");
    try {
      const body: any = { ...createForm };
      if (!body.collector_id) delete body.collector_id;
      body.amount_due = parseFloat(body.amount_due) || 0;
      body.days_overdue = parseInt(body.days_overdue) || 0;
      body.months_overdue = parseInt(body.months_overdue) || 0;
      // Clean empty strings to null
      for (const k of ["client_phone", "client_email", "plan_name", "notes", "last_payment_date"]) {
        if (!body[k]) body[k] = null;
      }
      const res = await fetch("/api/crm-cobranzas/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Error"); }
      setShowCreateModal(false); setCreateForm(EMPTY_COLLECTION_FORM); fetchCollections();
    } catch (err: any) { setCreateError(err.message); }
    finally { setCreateSaving(false); }
  };

  // Drag handlers
  const moveCollection = async (collectionId: string, newStage: string) => {
    const c = collections.find(x => x.id === collectionId);
    if (!c || c.stage === newStage) return;
    // Optimistic update
    setCollections(prev => prev.map(x => x.id === collectionId ? { ...x, stage: newStage } : x));
    try {
      await fetch(`/api/crm-cobranzas/cases/${collectionId}/move`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      fetchCollections();
    } catch {
      fetchCollections(); // revert on error
    }
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.setData("collectionId", id);
    setDraggingId(id);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>, colKey: string) => {
    e.preventDefault();
    setDragOverCol(colKey);
  };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = (e: DragEvent<HTMLDivElement>, colKey: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("collectionId");
    if (id) moveCollection(id, colKey);
    setDraggingId(null);
    setDragOverCol(null);
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverCol(null); };

  // Stats
  const activeStages = ["leads_entrantes", "contacto_inicial", "info_enviada", "gestion_suspendidos", "gestion_pre_retiro", "gestion_cobranza"];
  const activeCases = collections.filter(c => activeStages.includes(c.stage));
  const recoveredCases = collections.filter(c => c.stage === "recuperado");
  const totalDebt = activeCases.reduce((s, c) => s + (c.amount_due || 0), 0);
  const recoveredAmount = recoveredCases.reduce((s, c) => s + (c.amount_paid || 0), 0);
  const recoveryRate = total > 0 ? Math.round((recoveredCases.length / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Total Casos</p>
          <p className="text-xl font-bold text-white">{total}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">En Gestión</p>
          <p className="text-xl font-bold text-amber-400">{activeCases.length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Recuperados</p>
          <p className="text-xl font-bold text-emerald-400">{recoveredCases.length}</p>
          <p className="text-[10px] text-gray-600">{fmtUSD(recoveredAmount)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Monto en Mora</p>
          <p className="text-xl font-bold text-red-400">{fmtUSD(totalDebt)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Tasa Recuperación</p>
          <p className="text-xl font-bold text-orange-400">{recoveryRate}%</p>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, código, teléfono..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-amber-400/50 focus:outline-none" />
        </div>

        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Etapa: Todas</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <select value={filterCollector} onChange={e => setFilterCollector(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Cobrador: Todos</option>
          {collectors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>

        {/* View toggle */}
        <div className="flex items-center border border-wuipi-border rounded-lg overflow-hidden">
          <button onClick={() => setViewMode("kanban")}
            className={`p-2 ${viewMode === "kanban" ? "bg-amber-400/10 text-amber-400" : "text-gray-500 hover:text-gray-300"}`}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode("table")}
            className={`p-2 ${viewMode === "table" ? "bg-amber-400/10 text-amber-400" : "text-gray-500 hover:text-gray-300"}`}>
            <List size={16} />
          </button>
        </div>

        <button onClick={fetchCollections} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <button onClick={() => { setCreateForm(EMPTY_COLLECTION_FORM); setCreateError(""); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-500/90 transition-colors">
          <Plus size={16} /> Nuevo Caso
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      ) : collections.length === 0 ? (
        <Card className="text-center py-12">
          <Banknote size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-sm mb-1">No hay casos de cobranza</p>
          <p className="text-gray-600 text-xs">Crea el primer caso con el botón &quot;Nuevo Caso&quot;</p>
        </Card>
      ) : viewMode === "kanban" ? (
        <KanbanBoard collections={collections} draggingId={draggingId} dragOverCol={dragOverCol}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onDrop={onDrop} onDragEnd={onDragEnd} onClickCollection={(c) => setSelectedCollectionId(c.id)} />
      ) : (
        <TableView collections={collections} onClickCollection={(c) => setSelectedCollectionId(c.id)} />
      )}

      {/* Quota dashboard */}
      <QuotaDashboard />

      {/* Create modal */}
      {showCreateModal && (
        <CreateCollectionModal form={createForm} setField={setCreateField} collectors={collectors}
          error={createError} saving={createSaving}
          onSave={handleCreate} onClose={() => setShowCreateModal(false)} />
      )}

      {/* Collection detail */}
      {selectedCollectionId && (
        <CollectionDetail collectionId={selectedCollectionId} collectors={collectors}
          onClose={() => setSelectedCollectionId(null)} onUpdated={fetchCollections} />
      )}
    </div>
  );
}

// ============================================
// TABLE VIEW
// ============================================
function TableView({ collections, onClickCollection }: { collections: CrmCollection[]; onClickCollection: (c: CrmCollection) => void }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-wuipi-border">
              <th className="text-left p-3 pl-4 font-medium">Código</th>
              <th className="text-left p-3 font-medium">Cliente</th>
              <th className="text-left p-3 font-medium">Plan</th>
              <th className="text-center p-3 font-medium">Etapa</th>
              <th className="text-left p-3 font-medium">Cobrador</th>
              <th className="text-center p-3 font-medium">Días Mora</th>
              <th className="text-right p-3 font-medium">Deuda</th>
              <th className="text-right p-3 pr-4 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {collections.map(c => {
              const st = STAGE_MAP[c.stage] || STAGES[0];
              return (
                <tr key={c.id} onClick={() => onClickCollection(c)}
                  className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer">
                  <td className="p-3 pl-4 font-mono text-gray-300 text-xs">{c.code}</td>
                  <td className="p-3">
                    <p className="text-white font-medium truncate max-w-[250px]">{c.client_name}</p>
                    <p className="text-gray-600 text-xs">{c.client_phone || c.client_email || ""}</p>
                  </td>
                  <td className="p-3 text-gray-300 text-xs truncate max-w-[150px]">{c.plan_name || "—"}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.text} ${st.bg}`}>{st.label}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-400">{c.crm_collectors?.full_name || "Sin asignar"}</td>
                  <td className="p-3 text-center">
                    <span className={`text-xs font-bold ${
                      c.days_overdue > 90 ? "text-red-400" : c.days_overdue > 30 ? "text-orange-400" : "text-amber-400"
                    }`}>{c.days_overdue}d</span>
                  </td>
                  <td className="p-3 text-right text-xs font-bold text-red-400">{c.amount_due > 0 ? `$${c.amount_due.toLocaleString("es-VE")}` : "—"}</td>
                  <td className="p-3 pr-4 text-right text-xs text-gray-500">{timeAgo(c.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
