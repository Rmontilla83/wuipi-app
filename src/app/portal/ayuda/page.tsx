"use client";

import { useState, useEffect, useCallback } from "react";
import { usePortal } from "@/lib/portal/context";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Headphones, Send, Bot, Clock, CheckCircle2,
  AlertCircle, MessageSquare, ChevronDown,
} from "lucide-react";

interface PortalTicket {
  id: string;
  subject: string;
  description: string | null;
  category: string;
  status: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "soporte_tecnico", label: "Soporte Tecnico" },
  { value: "facturacion", label: "Facturacion" },
  { value: "cambio_plan", label: "Cambio de plan" },
  { value: "general", label: "Consulta general" },
];

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    open: { label: "Abierto", color: "text-blue-400 bg-blue-400/10" },
    in_progress: { label: "En proceso", color: "text-amber-400 bg-amber-400/10" },
    resolved: { label: "Resuelto", color: "text-emerald-400 bg-emerald-400/10" },
    closed: { label: "Cerrado", color: "text-gray-400 bg-gray-400/10" },
  };
  const c = cfg[status] || { label: status, color: "text-gray-400 bg-gray-400/10" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

export default function PortalSoporte() {
  const { partnerId, customerName, email } = usePortal();
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/tickets?partner_id=${partnerId}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/portal/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odoo_partner_id: partnerId,
          customer_email: email,
          customer_name: customerName,
          subject: subject.trim(),
          description: description.trim() || null,
          category,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setSubject("");
        setDescription("");
        setCategory("general");
        fetchTickets();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Soporte</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:opacity-90"
          >
            <MessageSquare size={14} /> Crear ticket
          </button>
        )}
      </div>

      {/* Soportin placeholder */}
      <Card className="!p-4 border-wuipi-purple/20 bg-wuipi-purple/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-wuipi-purple/20 flex items-center justify-center shrink-0">
            <Bot size={20} className="text-wuipi-purple" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">Soportin IA</p>
            <p className="text-gray-500 text-xs">Tu asistente virtual 24/7 estara disponible pronto</p>
          </div>
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-400 bg-amber-400/10">
            <Clock size={10} className="inline mr-1" />Pronto
          </span>
        </div>
      </Card>

      {/* Create ticket form */}
      {showForm && (
        <Card className="!p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Nuevo ticket</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Categoria</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="appearance-none w-full px-3 py-2 pr-8 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-wuipi-accent/50 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Asunto *</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="Describe brevemente tu problema"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Descripcion (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Detalla tu situacion..."
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={sending || !subject.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-300">
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Tickets list */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>
      ) : tickets.length === 0 && !showForm ? (
        <Card className="text-center py-12">
          <Headphones size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400 text-sm">No tienes tickets de soporte</p>
          <p className="text-gray-600 text-xs mt-1">Crea uno si necesitas ayuda</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <Card key={t.id} className="!p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{t.subject}</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">
                    {CATEGORIES.find((c) => c.value === t.category)?.label || t.category} — {new Date(t.created_at).toLocaleDateString("es-VE")}
                  </p>
                  {t.description && <p className="text-gray-400 text-xs mt-1 line-clamp-2">{t.description}</p>}
                </div>
                <StatusBadge status={t.status} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
