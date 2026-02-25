"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft, Headphones, RefreshCw, AlertTriangle,
  Clock, User, Send, MessageSquare, Tag, Zap,
  Phone, Mail, MapPin, ChevronDown, ExternalLink,
  CheckCircle, XCircle,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface Comment {
  id: string; content: string; is_internal: boolean;
  comment_type: string; old_value: string; new_value: string;
  created_at: string;
  author?: { id: string; full_name: string; avatar_url: string; role: string } | null;
}

interface TicketDetail {
  id: string; ticket_number: string; subject: string; description: string;
  priority: string; status: string; channel: string;
  sector: string; nodo: string;
  sla_deadline: string | null; sla_breached: boolean;
  first_response_at: string | null; resolved_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string;
  kommo_lead_id: number | null;
  clients?: { id: string; code: string; legal_name: string; phone: string; email: string; sector: string; nodo: string; service_status: string } | null;
  ticket_categories?: { id: string; name: string; slug: string; color: string } | null;
  assigned?: { id: string; full_name: string; email: string; avatar_url: string } | null;
  creator?: { id: string; full_name: string } | null;
  comments: Comment[];
}

const STATUSES = [
  { key: "new", label: "Nuevo", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  { key: "assigned", label: "Asignado", color: "text-blue-400", bg: "bg-blue-400/10" },
  { key: "in_progress", label: "En progreso", color: "text-amber-400", bg: "bg-amber-400/10" },
  { key: "waiting_client", label: "Esperando cliente", color: "text-purple-400", bg: "bg-purple-400/10" },
  { key: "resolved", label: "Resuelto", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { key: "closed", label: "Cerrado", color: "text-gray-400", bg: "bg-gray-400/10" },
];

const PRIORITY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "Crítico", color: "text-red-400", bg: "bg-red-400/10" },
  high: { label: "Alto", color: "text-orange-400", bg: "bg-orange-400/10" },
  medium: { label: "Medio", color: "text-amber-400", bg: "bg-amber-400/10" },
  low: { label: "Bajo", color: "text-blue-400", bg: "bg-blue-400/10" },
};

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo", assigned: "Asignado", in_progress: "En progreso",
  waiting_client: "Esperando cliente", resolved: "Resuelto", closed: "Cerrado",
};

// ============================================
// MAIN PAGE
// ============================================
export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tickets/${ticketId}?comments=true`);
      if (!res.ok) throw new Error("Ticket no encontrado");
      setTicket(await res.json());
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const changeStatus = async (newStatus: string) => {
    if (!ticket || ticket.status === newStatus) { setStatusOpen(false); return; }
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, _track_change: true, _old_status: ticket.status }),
      });
      fetchTicket();
    } catch (err) { console.error(err); }
    setStatusOpen(false);
  };

  const sendComment = async () => {
    if (!newComment.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/tickets/${ticketId}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment, is_internal: isInternal }),
      });
      setNewComment("");
      fetchTicket();
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  };

  if (loading) return (
    <>
      <TopBar title="Ticket" icon={<Headphones size={22} />} />
      <div className="flex-1 flex items-center justify-center"><RefreshCw className="animate-spin text-gray-500" size={24} /></div>
    </>
  );

  if (error || !ticket) return (
    <>
      <TopBar title="Ticket" icon={<Headphones size={22} />} />
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangle size={48} className="mb-4" />
        <p className="text-lg mb-4">{error || "Ticket no encontrado"}</p>
        <button onClick={() => router.push("/soporte")} className="text-wuipi-accent hover:underline text-sm">← Volver a soporte</button>
      </div>
    </>
  );

  const st = STATUSES.find(s => s.key === ticket.status) || STATUSES[0];
  const pri = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.medium;

  return (
    <>
      <TopBar title={ticket.ticket_number} subtitle={ticket.subject} icon={<Headphones size={22} />}
        actions={
          <button onClick={() => router.push("/soporte")} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white text-sm transition-colors">
            <ArrowLeft size={14} /> Volver
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-4">
          {/* Left: Main content + Timeline */}
          <div className="col-span-2 space-y-4">
            {/* Ticket Header */}
            <Card>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">{ticket.subject}</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-500">{ticket.ticket_number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color} ${st.bg}`}>{st.label}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pri.color} ${pri.bg}`}>{pri.label}</span>
                    {ticket.ticket_categories && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.ticket_categories.color }} />
                        {ticket.ticket_categories.name}
                      </span>
                    )}
                    {ticket.sla_breached && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold text-red-400 bg-red-400/10">⚠ SLA VIOLADO</span>
                    )}
                  </div>
                </div>

                {/* Status dropdown */}
                <div className="relative">
                  <button onClick={() => setStatusOpen(!statusOpen)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border ${st.color} ${st.bg} border-white/5`}>
                    {st.label} <ChevronDown size={14} />
                  </button>
                  {statusOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-wuipi-card border border-wuipi-border rounded-lg shadow-xl z-10 min-w-[180px]">
                      {STATUSES.map(s => (
                        <button key={s.key} onClick={() => changeStatus(s.key)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-wuipi-card-hover transition-colors ${
                            ticket.status === s.key ? "font-bold" : ""
                          } ${s.color}`}>
                          {ticket.status === s.key && <CheckCircle size={12} />}
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {ticket.description && (
                <div className="p-3 bg-wuipi-bg rounded-lg text-sm text-gray-300 whitespace-pre-wrap">
                  {ticket.description}
                </div>
              )}
            </Card>

            {/* Timeline / Comments */}
            <Card>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <MessageSquare size={16} /> Actividad
              </h3>

              <div className="space-y-3 mb-4 max-h-[400px] overflow-auto">
                {/* Creation event */}
                <TimelineEvent
                  type="system"
                  content={`Ticket creado vía ${ticket.channel}${ticket.creator ? ` por ${ticket.creator.full_name}` : ""}`}
                  time={ticket.created_at}
                />

                {(ticket.comments || []).map(c => (
                  <TimelineEvent key={c.id} type={c.comment_type === "comment" ? (c.is_internal ? "internal" : "comment") : "system"}
                    content={c.content} time={c.created_at} author={c.author?.full_name} />
                ))}

                {ticket.resolved_at && (
                  <TimelineEvent type="system" content="Ticket marcado como resuelto" time={ticket.resolved_at} />
                )}
                {ticket.closed_at && (
                  <TimelineEvent type="system" content="Ticket cerrado" time={ticket.closed_at} />
                )}
              </div>

              {/* Comment input */}
              <div className="border-t border-wuipi-border pt-3">
                <div className="flex items-start gap-2">
                  <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                    rows={2} placeholder="Escribe un comentario..."
                    className="flex-1 px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none resize-none"
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendComment(); }}
                  />
                  <div className="flex flex-col gap-2">
                    <button onClick={sendComment} disabled={sending || !newComment.trim()}
                      className="p-2 rounded-lg bg-wuipi-accent text-white hover:bg-wuipi-accent/90 disabled:opacity-50 transition-colors">
                      <Send size={16} />
                    </button>
                    <button onClick={() => setIsInternal(!isInternal)} title={isInternal ? "Nota interna" : "Visible para cliente"}
                      className={`p-2 rounded-lg border text-xs transition-colors ${
                        isInternal ? "border-amber-500/30 text-amber-400 bg-amber-400/10" : "border-wuipi-border text-gray-500"
                      }`}>
                      {isInternal ? "🔒" : "👁"}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  {isInternal ? "🔒 Nota interna — no visible para el cliente" : "👁 Visible para el cliente"} • Ctrl+Enter para enviar
                </p>
              </div>
            </Card>
          </div>

          {/* Right: Sidebar */}
          <div className="space-y-4">
            {/* Details */}
            <Card>
              <h3 className="text-sm font-bold text-gray-400 mb-3">Detalles</h3>
              <div className="space-y-3 text-sm">
                <DetailRow label="Estado" value={<span className={`${st.color} font-semibold`}>{st.label}</span>} />
                <DetailRow label="Prioridad" value={<span className={`${pri.color} font-semibold`}>{pri.label}</span>} />
                <DetailRow label="Canal" value={ticket.channel} />
                <DetailRow label="Categoría" value={
                  ticket.ticket_categories ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.ticket_categories.color }} />
                      {ticket.ticket_categories.name}
                    </span>
                  ) : "—"
                } />
                <DetailRow label="Asignado" value={ticket.assigned?.full_name || "Sin asignar"} />
                <DetailRow label="Sector" value={ticket.sector || "—"} />
                <DetailRow label="Nodo" value={ticket.nodo || "—"} />
              </div>
            </Card>

            {/* SLA */}
            <Card>
              <h3 className="text-sm font-bold text-gray-400 mb-3">SLA</h3>
              <div className="space-y-3 text-sm">
                <DetailRow label="Deadline" value={
                  <span className={ticket.sla_breached ? "text-red-400 font-bold" : "text-gray-300"}>
                    {fmtDate(ticket.sla_deadline)}
                  </span>
                } />
                <DetailRow label="Creado" value={fmtDate(ticket.created_at)} />
                <DetailRow label="Primer respuesta" value={fmtDate(ticket.first_response_at)} />
                <DetailRow label="Resuelto" value={fmtDate(ticket.resolved_at)} />
                {ticket.sla_breached && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-semibold text-center">
                    ⚠ SLA Violado
                  </div>
                )}
              </div>
            </Card>

            {/* Client */}
            {ticket.clients && (
              <Card>
                <h3 className="text-sm font-bold text-gray-400 mb-3">Cliente</h3>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">{ticket.clients.legal_name}</p>
                  <p className="text-xs text-gray-500">{ticket.clients.code}</p>
                  {ticket.clients.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Phone size={12} /> {ticket.clients.phone}
                    </div>
                  )}
                  {ticket.clients.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Mail size={12} /> {ticket.clients.email}
                    </div>
                  )}
                  <button onClick={() => router.push(`/clientes/${ticket.clients!.id}`)}
                    className="flex items-center gap-1 text-xs text-wuipi-accent hover:underline mt-2">
                    <ExternalLink size={12} /> Ver ficha del cliente
                  </button>
                </div>
              </Card>
            )}

            {/* Kommo reference */}
            {ticket.kommo_lead_id && (
              <Card className="!bg-cyan-500/5 border-cyan-500/10">
                <div className="flex items-center gap-2 text-xs text-cyan-400">
                  <ExternalLink size={12} />
                  Kommo Lead #{ticket.kommo_lead_id}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================
// HELPERS
// ============================================
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-300">{value}</span>
    </div>
  );
}

function TimelineEvent({ type, content, time, author }: {
  type: "comment" | "internal" | "system"; content: string; time: string; author?: string;
}) {
  const configs = {
    comment:  { icon: MessageSquare, color: "text-wuipi-accent", bg: "bg-wuipi-accent/10", border: "border-wuipi-accent/20" },
    internal: { icon: MessageSquare, color: "text-amber-400",    bg: "bg-amber-400/10",    border: "border-amber-400/20" },
    system:   { icon: Zap,           color: "text-gray-500",     bg: "bg-gray-500/10",     border: "border-gray-500/20" },
  };
  const cfg = configs[type];
  const Icon = cfg.icon;

  return (
    <div className={`flex gap-3 p-3 rounded-lg ${cfg.bg} border ${cfg.border}`}>
      <Icon size={14} className={`${cfg.color} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300">{content}</p>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-600">
          {author && <span>{author}</span>}
          <span>{fmtDate(time)}</span>
          {type === "internal" && <span className="text-amber-400">🔒 Interno</span>}
        </div>
      </div>
    </div>
  );
}
