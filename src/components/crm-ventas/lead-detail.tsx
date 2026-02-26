"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Save, ArrowRight, Phone, Mail, MapPin,
  MessageSquare, PhoneCall, Eye, ArrowRightLeft,
  Settings, Send, Plus, User, Clock, FileText, Trash2,
} from "lucide-react";
import { STAGES, STAGE_MAP } from "./kanban-board";
import type { CrmLead } from "./kanban-board";

interface Activity {
  id: string;
  lead_id: string;
  type: string;
  description: string;
  metadata: any;
  created_by: string | null;
  created_at: string;
}

interface Product { id: string; name: string; category: string; base_price: number; }
interface Salesperson { id: string; full_name: string; type: string; }

const ACTIVITY_ICONS: Record<string, any> = {
  note: MessageSquare, call: PhoneCall, visit: Eye, stage_change: ArrowRightLeft,
  assignment: User, email: Send, system: Settings,
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Nota", call: "Llamada", visit: "Visita", stage_change: "Cambio de etapa",
  assignment: "Asignación", email: "Email", system: "Sistema",
};

const timeAgo = (ts: string) => {
  const d = new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `hace ${mins}m`;
  if (mins < 1440) return `hace ${Math.floor(mins / 60)}h`;
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
};

export default function LeadDetail({ leadId, products, salespeople, onClose, onUpdated }: {
  leadId: string;
  products: Product[];
  salespeople: Salesperson[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [lead, setLead] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Move stage
  const [moveStage, setMoveStage] = useState("");

  // New activity
  const [actType, setActType] = useState("note");
  const [actDesc, setActDesc] = useState("");
  const [actSaving, setActSaving] = useState(false);

  const fetchLead = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/crm-ventas/leads/${leadId}?detail=true`);
      const json = await res.json();
      setLead(json);
      setActivities(json.activities || []);
      setMoveStage(json.stage);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const handleEdit = () => {
    setEditing(true);
    setEditForm({
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      address: lead.address || "",
      city: lead.city || "",
      state: lead.state || "",
      sector: lead.sector || "",
      nodo: lead.nodo || "",
      document_type: lead.document_type || "",
      document_number: lead.document_number || "",
      product_id: lead.product_id || "",
      salesperson_id: lead.salesperson_id || "",
      source: lead.source || "other",
      value: lead.value || 0,
      notes: lead.notes || "",
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = { ...editForm };
      if (!body.product_id) body.product_id = null;
      if (!body.salesperson_id) body.salesperson_id = null;
      if (!body.document_type) body.document_type = null;
      body.value = parseFloat(body.value) || 0;
      const res = await fetch(`/api/crm-ventas/leads/${leadId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditing(false);
      fetchLead();
      onUpdated();
    } catch (err: any) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleMove = async () => {
    if (!moveStage || moveStage === lead.stage) return;
    try {
      const res = await fetch(`/api/crm-ventas/leads/${leadId}/move`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: moveStage }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchLead();
      onUpdated();
    } catch (err: any) { console.error(err); }
  };

  const handleAddActivity = async () => {
    if (!actDesc.trim()) return;
    setActSaving(true);
    try {
      const res = await fetch(`/api/crm-ventas/leads/${leadId}/activities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: actType, description: actDesc }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setActDesc("");
      fetchLead();
    } catch (err: any) { console.error(err); }
    finally { setActSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este lead?")) return;
    try {
      await fetch(`/api/crm-ventas/leads/${leadId}`, { method: "DELETE" });
      onUpdated();
      onClose();
    } catch (err) { console.error(err); }
  };

  const setField = (k: string, v: any) => setEditForm((f: any) => ({ ...f, [k]: v }));

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-wuipi-card border border-wuipi-border rounded-2xl p-8">
          <div className="animate-spin w-6 h-6 border-2 border-wuipi-accent border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  if (!lead) return null;

  const stageConfig = STAGE_MAP[lead.stage] || STAGES[0];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-wuipi-card border border-wuipi-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-500">{lead.code}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stageConfig.text} ${stageConfig.bg}`}>
                {stageConfig.label}
              </span>
              {lead.client_id && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-400 bg-emerald-400/10">
                  Cliente creado
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
              <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
            </div>
          </div>
          <h2 className="text-lg font-bold text-white mt-2">{lead.name}</h2>
          {/* Quick contact */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            {lead.phone && <span className="flex items-center gap-1"><Phone size={12} />{lead.phone}</span>}
            {lead.email && <span className="flex items-center gap-1"><Mail size={12} />{lead.email}</span>}
            {lead.address && <span className="flex items-center gap-1"><MapPin size={12} className="shrink-0" /><span className="truncate max-w-[200px]">{lead.address}</span></span>}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Move stage */}
          <div className="flex items-center gap-2 p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
            <span className="text-xs text-gray-500 shrink-0">Mover a:</span>
            <select value={moveStage} onChange={e => setMoveStage(e.target.value)}
              className="flex-1 px-2 py-1 rounded-lg bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none">
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={handleMove} disabled={moveStage === lead.stage}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-wuipi-accent text-white text-xs font-medium disabled:opacity-30 hover:bg-wuipi-accent/90">
              <ArrowRight size={12} /> Mover
            </button>
          </div>

          {/* Lead info (view/edit) */}
          <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400">Información del Lead</span>
              {!editing ? (
                <button onClick={handleEdit} className="text-xs text-wuipi-accent hover:underline">Editar</button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-white">Cancelar</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-wuipi-accent text-white text-xs disabled:opacity-50">
                    <Save size={10} /> {saving ? "..." : "Guardar"}
                  </button>
                </div>
              )}
            </div>

            {!editing ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoRow label="Producto" value={lead.crm_products?.name || "—"} />
                <InfoRow label="Vendedor" value={lead.crm_salespeople?.full_name || "Sin asignar"} />
                <InfoRow label="Fuente" value={lead.source} />
                <InfoRow label="Valor" value={lead.value > 0 ? `$${lead.value}` : "—"} />
                <InfoRow label="Documento" value={lead.document_type ? `${lead.document_type}-${lead.document_number}` : "—"} />
                <InfoRow label="Sector / Nodo" value={[lead.sector, lead.nodo].filter(Boolean).join(" / ") || "—"} />
                <InfoRow label="Ciudad" value={lead.city || "—"} />
                <InfoRow label="Estado" value={lead.state || "—"} />
                {lead.notes && <div className="col-span-2"><span className="text-gray-500">Notas:</span> <span className="text-gray-300">{lead.notes}</span></div>}
              </div>
            ) : (
              <div className="space-y-2">
                <EditField label="Nombre" value={editForm.name} onChange={v => setField("name", v)} />
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Teléfono" value={editForm.phone} onChange={v => setField("phone", v)} />
                  <EditField label="Email" value={editForm.email} onChange={v => setField("email", v)} />
                </div>
                <EditField label="Dirección" value={editForm.address} onChange={v => setField("address", v)} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Producto</label>
                    <select value={editForm.product_id} onChange={e => setField("product_id", e.target.value)}
                      className="w-full px-2 py-1 rounded bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none">
                      <option value="">Sin producto</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Vendedor</label>
                    <select value={editForm.salesperson_id} onChange={e => setField("salesperson_id", e.target.value)}
                      className="w-full px-2 py-1 rounded bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none">
                      <option value="">Sin asignar</option>
                      {salespeople.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Valor (USD)" value={editForm.value} onChange={v => setField("value", v)} type="number" />
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Fuente</label>
                    <select value={editForm.source} onChange={e => setField("source", e.target.value)}
                      className="w-full px-2 py-1 rounded bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none">
                      <option value="whatsapp">WhatsApp</option>
                      <option value="web">Web</option>
                      <option value="referido">Referido</option>
                      <option value="social">Social</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Add activity */}
          <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
            <span className="text-xs font-bold text-gray-400 mb-2 block">Agregar Actividad</span>
            <div className="flex items-start gap-2">
              <select value={actType} onChange={e => setActType(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none shrink-0">
                <option value="note">Nota</option>
                <option value="call">Llamada</option>
                <option value="visit">Visita</option>
                <option value="email">Email</option>
              </select>
              <textarea value={actDesc} onChange={e => setActDesc(e.target.value)} rows={2} placeholder="Descripción de la actividad..."
                className="flex-1 px-2 py-1.5 rounded-lg bg-wuipi-card border border-wuipi-border text-xs text-white placeholder-gray-600 focus:outline-none resize-none" />
              <button onClick={handleAddActivity} disabled={actSaving || !actDesc.trim()}
                className="px-3 py-1.5 rounded-lg bg-wuipi-accent text-white text-xs font-medium disabled:opacity-30 hover:bg-wuipi-accent/90 shrink-0">
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <span className="text-xs font-bold text-gray-400 mb-3 block flex items-center gap-2">
              <Clock size={12} /> Timeline ({activities.length})
            </span>
            <div className="space-y-2">
              {activities.map(act => {
                const Icon = ACTIVITY_ICONS[act.type] || FileText;
                const isStageChange = act.type === "stage_change";
                const fromStage = isStageChange && act.metadata?.from_stage ? STAGE_MAP[act.metadata.from_stage] : null;
                const toStage = isStageChange && act.metadata?.to_stage ? STAGE_MAP[act.metadata.to_stage] : null;

                return (
                  <div key={act.id} className="flex gap-3 p-2 rounded-lg hover:bg-wuipi-card/50 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-wuipi-card border border-wuipi-border flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={12} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">{ACTIVITY_LABELS[act.type] || act.type}</span>
                        <span className="text-[10px] text-gray-600">{timeAgo(act.created_at)}</span>
                        {act.created_by && <span className="text-[10px] text-gray-600">— {act.created_by}</span>}
                      </div>
                      {isStageChange && fromStage && toStage ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${fromStage.text} ${fromStage.bg}`}>{fromStage.label}</span>
                          <ArrowRight size={12} className="text-gray-500" />
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${toStage.text} ${toStage.bg}`}>{toStage.label}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-300">{act.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-4">Sin actividades registradas</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}:</span>{" "}
      <span className="text-gray-300">{value}</span>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 block mb-0.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1 rounded bg-wuipi-card border border-wuipi-border text-xs text-white focus:outline-none" />
    </div>
  );
}
