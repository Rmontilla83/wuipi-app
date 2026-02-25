"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import {
  Plus, Search, X, Save, RefreshCw,
  AlertTriangle, Clock, CheckCircle, User,
  Tag, Zap, Filter, TicketCheck,
  ChevronDown, MessageSquare, Phone, Mail,
  ArrowUpRight,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface Category { id: string; name: string; slug: string; color: string; }
interface Technician { id: string; full_name: string; email: string; role: string; }
interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "new" | "assigned" | "in_progress" | "waiting_client" | "resolved" | "closed";
  channel: string;
  sector: string;
  nodo: string;
  sla_deadline: string | null;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  clients?: { id: string; code: string; legal_name: string; phone: string } | null;
  ticket_categories?: { id: string; name: string; slug: string; color: string } | null;
  assigned?: { id: string; full_name: string; email: string } | null;
  creator?: { id: string; full_name: string } | null;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: "Crítico", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-500/30" },
  high:     { label: "Alto",    color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-500/30" },
  medium:   { label: "Medio",   color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-500/30" },
  low:      { label: "Bajo",    color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-500/30" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new:            { label: "Nuevo",           color: "text-cyan-400",    bg: "bg-cyan-400/10" },
  assigned:       { label: "Asignado",        color: "text-blue-400",    bg: "bg-blue-400/10" },
  in_progress:    { label: "En progreso",     color: "text-amber-400",   bg: "bg-amber-400/10" },
  waiting_client: { label: "Esperando cliente", color: "text-purple-400", bg: "bg-purple-400/10" },
  resolved:       { label: "Resuelto",        color: "text-emerald-400", bg: "bg-emerald-400/10" },
  closed:         { label: "Cerrado",         color: "text-gray-400",    bg: "bg-gray-400/10" },
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

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Debounce search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      params.set("limit", "50");

      const res = await fetch(`/api/tickets?${params}`);
      const json = await res.json();
      setTickets(json.data || []);
      setTotal(json.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatus, filterPriority]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Fetch categories & technicians on mount
  useEffect(() => {
    fetch("/api/tickets?type=categories").then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/tickets?type=technicians").then(r => r.json()).then(d => setTechnicians(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/facturacion/clients?limit=200").then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : (d.data || []);
      setClients(list);
    }).catch(() => {});
  }, []);

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.subject.trim()) { setError("El asunto es obligatorio"); return; }
    setSaving(true);
    setError("");
    try {
      const body: any = { ...form };
      if (!body.category_id) delete body.category_id;
      if (!body.client_id) delete body.client_id;
      if (!body.assigned_to) delete body.assigned_to;

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear ticket");
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (ticket: Ticket, newStatus: string) => {
    try {
      await fetch(`/api/tickets/${ticket.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          _track_change: true,
          _old_status: ticket.status,
        }),
      });
      fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

  const timeAgo = (ts: string) => {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  // Stats
  const activeTickets = tickets.filter(t => !["resolved", "closed"].includes(t.status));
  const breachedCount = tickets.filter(t => t.sla_breached && !["resolved", "closed"].includes(t.status)).length;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold text-white">{total}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Activos</p>
          <p className="text-xl font-bold text-cyan-400">{activeTickets.length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Nuevos</p>
          <p className="text-xl font-bold text-blue-400">{tickets.filter(t => t.status === "new").length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Resueltos</p>
          <p className="text-xl font-bold text-emerald-400">{tickets.filter(t => t.status === "resolved").length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">SLA Violado</p>
          <p className={`text-xl font-bold ${breachedCount > 0 ? "text-red-400" : "text-gray-500"}`}>{breachedCount}</p>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por asunto o número..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none"
          />
        </div>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Estado: Todos</option>
          <option value="new">Nuevo</option>
          <option value="assigned">Asignado</option>
          <option value="in_progress">En progreso</option>
          <option value="waiting_client">Esperando cliente</option>
          <option value="resolved">Resuelto</option>
          <option value="closed">Cerrado</option>
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
          <option value="all">Prioridad: Todas</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
        </select>

        <button onClick={fetchTickets} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>

        <button
          onClick={() => { setForm(EMPTY_FORM); setError(""); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:bg-wuipi-accent/90 transition-colors"
        >
          <Plus size={16} /> Nuevo Ticket
        </button>
      </div>

      {/* Tickets Table */}
      <Card className="!p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-gray-500" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <TicketCheck size={48} className="mx-auto mb-4 text-gray-600" />
            <p className="text-gray-400 text-sm mb-1">No hay tickets</p>
            <p className="text-gray-600 text-xs">Crea el primer ticket con el botón &quot;Nuevo Ticket&quot;</p>
          </div>
        ) : (
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
                  <th className="text-left p-3 font-medium">SLA</th>
                  <th className="text-right p-3 pr-4 font-medium">Creado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(ticket => {
                  const pri = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
                  const st = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.new;
                  const slaOk = !ticket.sla_breached;
                  const slaText = ticket.sla_deadline
                    ? (slaOk ? timeAgo(ticket.sla_deadline) : "⚠ Vencido")
                    : "—";

                  return (
                    <tr key={ticket.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer"
                      onClick={() => router.push(`/soporte/${ticket.id}`)}>
                      <td className="p-3 pl-4">
                        <span className="font-mono text-gray-300">{ticket.ticket_number}</span>
                      </td>
                      <td className="p-3">
                        <p className="text-white font-medium truncate max-w-[250px]">{ticket.subject}</p>
                        <p className="text-gray-600 text-xs">{CHANNEL_LABELS[ticket.channel] || ticket.channel}</p>
                      </td>
                      <td className="p-3">
                        <p className="text-gray-300 text-xs truncate max-w-[150px]">
                          {ticket.clients?.legal_name || "Sin cliente"}
                        </p>
                        {ticket.clients?.code && <p className="text-gray-600 text-[10px]">{ticket.clients.code}</p>}
                      </td>
                      <td className="p-3">
                        {ticket.ticket_categories ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.ticket_categories.color }} />
                            {ticket.ticket_categories.name}
                          </span>
                        ) : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pri.color} ${pri.bg} ${pri.border}`}>
                          {pri.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color} ${st.bg}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {ticket.assigned?.full_name || "Sin asignar"}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs font-medium ${ticket.sla_breached ? "text-red-400" : "text-gray-500"}`}>
                          {slaText}
                        </span>
                      </td>
                      <td className="p-3 pr-4 text-right text-xs text-gray-500">
                        {timeAgo(ticket.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-white">Nuevo Ticket</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>

            <div className="p-4 space-y-4">
              {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}

              {/* Subject */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Asunto *</label>
                <input value={form.subject} onChange={e => setField("subject", e.target.value)}
                  placeholder="Descripción breve del problema"
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
                <textarea value={form.description} onChange={e => setField("description", e.target.value)}
                  rows={3} placeholder="Detalles adicionales..."
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none resize-none" />
              </div>

              {/* Priority + Channel */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Prioridad</label>
                  <select value={form.priority} onChange={e => setField("priority", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                    <option value="critical">Crítico</option>
                    <option value="high">Alto</option>
                    <option value="medium">Medio</option>
                    <option value="low">Bajo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Canal</label>
                  <select value={form.channel} onChange={e => setField("channel", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                    <option value="internal">Interno</option>
                    <option value="phone">Teléfono</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="portal">Portal</option>
                  </select>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
                <select value={form.category_id} onChange={e => setField("category_id", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Client */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Cliente</label>
                <select value={form.client_id} onChange={e => setField("client_id", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                  <option value="">Sin cliente</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.code} — {c.legal_name}</option>)}
                </select>
              </div>

              {/* Assigned */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Asignar a</label>
                <select value={form.assigned_to} onChange={e => setField("assigned_to", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                  <option value="">Sin asignar</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>

              {/* Sector + Nodo */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Sector</label>
                  <input value={form.sector} onChange={e => setField("sector", e.target.value)}
                    placeholder="Sector"
                    className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Nodo</label>
                  <input value={form.nodo} onChange={e => setField("nodo", e.target.value)}
                    placeholder="Nodo"
                    className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-wuipi-card border-t border-wuipi-border p-4 flex justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:bg-wuipi-accent/90 transition-colors disabled:opacity-50">
                <Save size={14} /> {saving ? "Guardando..." : "Crear Ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
