"use client";

import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Plus, Search, X, Save, RefreshCw,
  AlertTriangle, Clock, User, TicketCheck,
  LayoutGrid, List, GripVertical,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface Category { id: string; name: string; slug: string; color: string; }
interface Technician { id: string; full_name: string; email: string; role: string; }
interface Ticket {
  id: string; ticket_number: string; subject: string; description: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "assigned" | "in_progress" | "waiting_client" | "resolved" | "closed";
  channel: string; sector: string; nodo: string;
  sla_deadline: string | null; sla_breached: boolean;
  created_at: string; updated_at: string; resolved_at: string | null;
  clients?: { id: string; code: string; legal_name: string; phone: string } | null;
  ticket_categories?: { id: string; name: string; slug: string; color: string } | null;
  assigned?: { id: string; full_name: string; email: string } | null;
  creator?: { id: string; full_name: string } | null;
}

type ViewMode = "kanban" | "table";

const STATUSES = [
  { key: "new",            label: "Nuevo",           color: "#22d3ee", bg: "bg-cyan-400/10",    border: "border-cyan-400/30",    text: "text-cyan-400" },
  { key: "assigned",       label: "Asignado",        color: "#3b82f6", bg: "bg-blue-400/10",    border: "border-blue-400/30",    text: "text-blue-400" },
  { key: "in_progress",    label: "En progreso",     color: "#f59e0b", bg: "bg-amber-400/10",   border: "border-amber-400/30",   text: "text-amber-400" },
  { key: "waiting_client", label: "Esperando cliente",color: "#a855f7", bg: "bg-purple-400/10",  border: "border-purple-400/30",  text: "text-purple-400" },
  { key: "resolved",       label: "Resuelto",        color: "#34d399", bg: "bg-emerald-400/10", border: "border-emerald-400/30", text: "text-emerald-400" },
  { key: "closed",         label: "Cerrado",         color: "#6b7280", bg: "bg-gray-400/10",    border: "border-gray-400/30",    text: "text-gray-400" },
] as const;

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: "CRIT", color: "text-red-400 bg-red-400/10 border-red-500/30", dot: "bg-red-400" },
  high:     { label: "ALTO", color: "text-orange-400 bg-orange-400/10 border-orange-500/30", dot: "bg-orange-400" },
  medium:   { label: "MED",  color: "text-amber-400 bg-amber-400/10 border-amber-500/30", dot: "bg-amber-400" },
  low:      { label: "BAJO", color: "text-blue-400 bg-blue-400/10 border-blue-500/30", dot: "bg-blue-400" },
};

const CHANNEL_LABELS: Record<string, string> = {
  portal: "Portal", whatsapp: "WhatsApp", phone: "Teléfono",
  email: "Email", internal: "Interno", kommo: "Kommo",
};

const EMPTY_FORM = {
  subject: "", description: "", priority: "medium" as const,
  channel: "internal" as const, category_id: "", client_id: "",
  assigned_to: "", sector: "", nodo: "",
};

const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

// ============================================
// MAIN COMPONENT
// ============================================
export default function CRMSoporteTab() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      params.set("limit", "100");
      const res = await fetch(`/api/tickets?${params}`);
      const json = await res.json();
      setTickets(json.data || []);
      setTotal(json.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [debouncedSearch, filterPriority]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    fetch("/api/tickets?type=categories").then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/tickets?type=technicians").then(r => r.json()).then(d => setTechnicians(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/facturacion/clients?limit=200").then(r => r.json()).then(d => setClients(Array.isArray(d) ? d : (d.data || []))).catch(() => {});
  }, []);

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.subject.trim()) { setError("El asunto es obligatorio"); return; }
    setSaving(true); setError("");
    try {
      const body: any = { ...form };
      if (!body.category_id) delete body.category_id;
      if (!body.client_id) delete body.client_id;
      if (!body.assigned_to) delete body.assigned_to;
      const res = await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Error"); }
      setShowModal(false); setForm(EMPTY_FORM); fetchTickets();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const moveTicket = async (ticketId: string, newStatus: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;
    // Optimistic update
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus as any } : t));
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, _track_change: true, _old_status: ticket.status }),
      });
    } catch {
      fetchTickets(); // revert on error
    }
  };

  // Drag handlers
  const onDragStart = (e: DragEvent, ticketId: string) => {
    e.dataTransfer.setData("ticketId", ticketId);
    setDraggingId(ticketId);
  };
  const onDragOver = (e: DragEvent, colKey: string) => {
    e.preventDefault();
    setDragOverCol(colKey);
  };
  const onDragLeave = () => setDragOverCol(null);
  const onDrop = (e: DragEvent, colKey: string) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData("ticketId");
    if (ticketId) moveTicket(ticketId, colKey);
    setDraggingId(null);
    setDragOverCol(null);
  };
  const onDragEnd = () => { setDraggingId(null); setDragOverCol(null); };

  // Filtered tickets
  const filtered = tickets.filter(t => {
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      if (!t.subject.toLowerCase().includes(s) && !t.ticket_number.toLowerCase().includes(s)) return false;
    }
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    return true;
  });

  const activeCount = filtered.filter(t => !["resolved", "closed"].includes(t.status)).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold text-white">{total}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Activos</p>
          <p className="text-xl font-bold text-cyan-400">{activeCount}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Nuevos</p>
          <p className="text-xl font-bold text-blue-400">{filtered.filter(t => t.status === "new").length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Resueltos</p>
          <p className="text-xl font-bold text-emerald-400">{filtered.filter(t => t.status === "resolved").length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">SLA Violado</p>
          <p className={`text-xl font-bold ${filtered.some(t => t.sla_breached) ? "text-red-400" : "text-gray-500"}`}>
            {filtered.filter(t => t.sla_breached && !["resolved", "closed"].includes(t.status)).length}
          </p>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por asunto o número..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
        </div>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Prioridad: Todas</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
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

        <button onClick={fetchTickets} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <button onClick={() => { setForm(EMPTY_FORM); setError(""); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:bg-wuipi-accent/90 transition-colors">
          <Plus size={16} /> Nuevo Ticket
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <TicketCheck size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-sm mb-1">No hay tickets</p>
          <p className="text-gray-600 text-xs">Crea el primer ticket con el botón &quot;Nuevo Ticket&quot;</p>
        </Card>
      ) : viewMode === "kanban" ? (
        <KanbanBoard tickets={filtered} draggingId={draggingId} dragOverCol={dragOverCol}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onDrop={onDrop} onDragEnd={onDragEnd} onClickTicket={(t) => router.push(`/soporte/${t.id}`)} />
      ) : (
        <TableView tickets={filtered} onClickTicket={(t) => router.push(`/soporte/${t.id}`)} />
      )}

      {/* Create Modal */}
      {showModal && (
        <CreateModal form={form} setField={setField} categories={categories} clients={clients}
          technicians={technicians} error={error} saving={saving}
          onSave={handleSave} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

// ============================================
// KANBAN BOARD
// ============================================
function KanbanBoard({ tickets, draggingId, dragOverCol, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onClickTicket }: {
  tickets: Ticket[]; draggingId: string | null; dragOverCol: string | null;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, key: string) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, key: string) => void;
  onDragEnd: () => void;
  onClickTicket: (t: Ticket) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "400px" }}>
      {STATUSES.map(col => {
        const colTickets = tickets.filter(t => t.status === col.key);
        const isOver = dragOverCol === col.key;
        return (
          <div key={col.key}
            className={`flex-shrink-0 w-[260px] rounded-xl border transition-colors ${
              isOver ? `${col.border} ${col.bg}` : "border-wuipi-border/50 bg-wuipi-bg/30"
            }`}
            onDragOver={(e) => onDragOver(e as any, col.key)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e as any, col.key)}
          >
            {/* Column header */}
            <div className="p-3 border-b border-wuipi-border/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                  <span className={`text-xs font-bold ${col.text}`}>{col.label}</span>
                </div>
                <span className="text-xs font-bold text-gray-500 bg-wuipi-bg rounded-full w-6 h-6 flex items-center justify-center">
                  {colTickets.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 min-h-[100px]">
              {colTickets.map(ticket => (
                <KanbanCard key={ticket.id} ticket={ticket} isDragging={draggingId === ticket.id}
                  onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onClickTicket(ticket)} />
              ))}
              {colTickets.length === 0 && (
                <div className="text-center py-6 text-gray-700 text-xs">
                  Arrastra tickets aquí
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// KANBAN CARD
// ============================================
function KanbanCard({ ticket, isDragging, onDragStart, onDragEnd, onClick }: {
  ticket: Ticket; isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void; onClick: () => void;
}) {
  const pri = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e as any, ticket.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`p-2.5 rounded-lg bg-wuipi-card border border-wuipi-border hover:border-wuipi-accent/30 cursor-pointer transition-all ${
        isDragging ? "opacity-40 scale-95" : ""
      }`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-gray-500">{ticket.ticket_number}</span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${pri.color}`}>{pri.label}</span>
      </div>

      {/* Subject */}
      <p className="text-xs font-medium text-white leading-tight mb-2 line-clamp-2">{ticket.subject}</p>

      {/* Category */}
      {ticket.ticket_categories && (
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ticket.ticket_categories.color }} />
          <span className="text-[10px] text-gray-500">{ticket.ticket_categories.name}</span>
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-1 truncate">
          <User size={10} />
          <span className="truncate">{ticket.assigned?.full_name || "Sin asignar"}</span>
        </div>
        <div className="flex items-center gap-1">
          {ticket.sla_breached && <AlertTriangle size={10} className="text-red-400" />}
          <Clock size={10} />
          <span>{timeAgo(ticket.created_at)}</span>
        </div>
      </div>

      {/* Client */}
      {ticket.clients && (
        <div className="mt-1.5 pt-1.5 border-t border-wuipi-border/30 text-[10px] text-gray-500 truncate">
          {ticket.clients.legal_name}
        </div>
      )}
    </div>
  );
}

// ============================================
// TABLE VIEW
// ============================================
function TableView({ tickets, onClickTicket }: { tickets: Ticket[]; onClickTicket: (t: Ticket) => void }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-wuipi-border">
              <th className="text-left p-3 pl-4 font-medium">Ticket</th>
              <th className="text-left p-3 font-medium">Asunto</th>
              <th className="text-left p-3 font-medium">Cliente</th>
              <th className="text-left p-3 font-medium">Categoría</th>
              <th className="text-center p-3 font-medium">Prioridad</th>
              <th className="text-center p-3 font-medium">Estado</th>
              <th className="text-left p-3 font-medium">Asignado</th>
              <th className="text-right p-3 pr-4 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(ticket => {
              const pri = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
              const st = STATUSES.find(s => s.key === ticket.status) || STATUSES[0];
              return (
                <tr key={ticket.id} onClick={() => onClickTicket(ticket)}
                  className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer">
                  <td className="p-3 pl-4 font-mono text-gray-300 text-xs">{ticket.ticket_number}</td>
                  <td className="p-3">
                    <p className="text-white font-medium truncate max-w-[250px]">{ticket.subject}</p>
                    <p className="text-gray-600 text-xs">{CHANNEL_LABELS[ticket.channel] || ticket.channel}</p>
                  </td>
                  <td className="p-3 text-gray-300 text-xs truncate max-w-[150px]">{ticket.clients?.legal_name || "—"}</td>
                  <td className="p-3">
                    {ticket.ticket_categories ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.ticket_categories.color }} />
                        {ticket.ticket_categories.name}
                      </span>
                    ) : <span className="text-gray-600 text-xs">—</span>}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pri.color}`}>{pri.label}</span>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.text} ${st.bg}`}>{st.label}</span>
                  </td>
                  <td className="p-3 text-xs text-gray-400">{ticket.assigned?.full_name || "Sin asignar"}</td>
                  <td className="p-3 pr-4 text-right text-xs text-gray-500">{timeAgo(ticket.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ============================================
// CREATE MODAL
// ============================================
function CreateModal({ form, setField, categories, clients, technicians, error, saving, onSave, onClose }: {
  form: typeof EMPTY_FORM; setField: (k: string, v: any) => void;
  categories: Category[]; clients: any[]; technicians: Technician[];
  error: string; saving: boolean; onSave: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">Nuevo Ticket</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Asunto *</label>
            <input value={form.subject} onChange={e => setField("subject", e.target.value)} placeholder="Descripción breve del problema"
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
            <textarea value={form.description} onChange={e => setField("description", e.target.value)} rows={3} placeholder="Detalles adicionales..."
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Prioridad</label>
              <select value={form.priority} onChange={e => setField("priority", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="critical">Crítico</option><option value="high">Alto</option>
                <option value="medium">Medio</option><option value="low">Bajo</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Canal</label>
              <select value={form.channel} onChange={e => setField("channel", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="internal">Interno</option><option value="phone">Teléfono</option>
                <option value="whatsapp">WhatsApp</option><option value="email">Email</option>
                <option value="portal">Portal</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
            <select value={form.category_id} onChange={e => setField("category_id", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
              <option value="">Sin categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cliente</label>
            <select value={form.client_id} onChange={e => setField("client_id", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
              <option value="">Sin cliente</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Asignar a</label>
            <select value={form.assigned_to} onChange={e => setField("assigned_to", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
              <option value="">Sin asignar</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sector</label>
              <input value={form.sector} onChange={e => setField("sector", e.target.value)} placeholder="Sector"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nodo</label>
              <input value={form.nodo} onChange={e => setField("nodo", e.target.value)} placeholder="Nodo"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-wuipi-card border-t border-wuipi-border p-4 flex justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:bg-wuipi-accent/90 disabled:opacity-50">
            <Save size={14} /> {saving ? "Guardando..." : "Crear Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
