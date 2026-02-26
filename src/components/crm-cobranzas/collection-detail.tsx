"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, Save, ArrowRight, Phone, Mail,
  MessageSquare, PhoneCall, Eye, ArrowRightLeft,
  Settings, Plus, User, Clock, FileText, Trash2,
  DollarSign, AlertTriangle, CheckCircle,
} from "lucide-react";
import { STAGES, STAGE_MAP } from "./kanban-board";
import type { CrmCollection } from "./kanban-board";

interface Activity {
  id: string;
  collection_id: string;
  type: string;
  description: string;
  metadata: any;
  created_by: string | null;
  created_at: string;
}

interface Collector { id: string; full_name: string; type: string; }

const ACTIVITY_ICONS: Record<string, any> = {
  note: MessageSquare, call: PhoneCall, visit: Eye, stage_change: ArrowRightLeft,
  payment_promise: Clock, payment_received: CheckCircle, assignment: User, system: Settings,
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Nota", call: "Llamada", visit: "Visita", stage_change: "Cambio de etapa",
  payment_promise: "Promesa de pago", payment_received: "Pago recibido",
  assignment: "Asignación", system: "Sistema",
};

const timeAgo = (ts: string) => {
  const d = new Date(ts);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `hace ${mins}m`;
  if (mins < 1440) return `hace ${Math.floor(mins / 60)}h`;
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CollectionDetail({ collectionId, collectors, onClose, onUpdated }: {
  collectionId: string;
  collectors: Collector[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [collection, setCollection] = useState<any>(null);
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

  const fetchCollection = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/crm-cobranzas/cases/${collectionId}?detail=true`);
      const json = await res.json();
      setCollection(json);
      setActivities(json.activities || []);
      setMoveStage(json.stage);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [collectionId]);

  useEffect(() => { fetchCollection(); }, [fetchCollection]);

  const handleEdit = () => {
    setEditing(true);
    setEditForm({
      client_name: collection.client_name || "",
      client_phone: collection.client_phone || "",
      client_email: collection.client_email || "",
      collector_id: collection.collector_id || "",
      amount_due: collection.amount_due || 0,
      amount_paid: collection.amount_paid || 0,
      currency: collection.currency || "USD",
      days_overdue: collection.days_overdue || 0,
      months_overdue: collection.months_overdue || 0,
      plan_name: collection.plan_name || "",
      notes: collection.notes || "",
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = { ...editForm };
      if (!body.collector_id) body.collector_id = null;
      body.amount_due = parseFloat(body.amount_due) || 0;
      body.amount_paid = parseFloat(body.amount_paid) || 0;
      body.days_overdue = parseInt(body.days_overdue) || 0;
      body.months_overdue = parseInt(body.months_overdue) || 0;
      const res = await fetch(`/api/crm-cobranzas/cases/${collectionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditing(false);
      fetchCollection();
      onUpdated();
    } catch (err: any) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleMove = async () => {
    if (!moveStage || moveStage === collection.stage) return;
    try {
      const res = await fetch(`/api/crm-cobranzas/cases/${collectionId}/move`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: moveStage }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchCollection();
      onUpdated();
    } catch (err: any) { console.error(err); }
  };

  const handleAddActivity = async () => {
    if (!actDesc.trim()) return;
    setActSaving(true);
    try {
      const res = await fetch(`/api/crm-cobranzas/cases/${collectionId}/activities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: actType, description: actDesc }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setActDesc("");
      fetchCollection();
    } catch (err: any) { console.error(err); }
    finally { setActSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este caso de cobranza?")) return;
    try {
      await fetch(`/api/crm-cobranzas/cases/${collectionId}`, { method: "DELETE" });
      onUpdated();
      onClose();
    } catch (err) { console.error(err); }
  };

  const setField = (k: string, v: any) => setEditForm((f: any) => ({ ...f, [k]: v }));

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-wuipi-card border border-wuipi-border rounded-2xl p-8">
          <div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  if (!collection) return null;

  const stageConfig = STAGE_MAP[collection.stage] || STAGES[0];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-wuipi-card border border-wuipi-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-500">{collection.code}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stageConfig.text} ${stageConfig.bg}`}>
                {stageConfig.label}
              </span>
              {collection.recovered_at && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-400 bg-emerald-400/10">
                  Recuperado
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
          <h2 className="text-lg font-bold text-white mt-2">{collection.client_name}</h2>
          {/* Quick contact */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
            {collection.client_phone && <span className="flex items-center gap-1"><Phone size={12} />{collection.client_phone}</span>}
            {collection.client_email && <span className="flex items-center gap-1"><Mail size={12} />{collection.client_email}</span>}
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Debt summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
              <p className="text-[10px] text-red-300">Deuda</p>
              <p className="text-sm font-bold text-red-400">{fmtUSD(collection.amount_due)}</p>
            </div>
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
              <p className="text-[10px] text-emerald-300">Pagado</p>
              <p className="text-sm font-bold text-emerald-400">{fmtUSD(collection.amount_paid)}</p>
            </div>
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
              <p className="text-[10px] text-amber-300">Días en Mora</p>
              <p className="text-sm font-bold text-amber-400">{collection.days_overdue}d</p>
            </div>
            <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg text-center">
              <p className="text-[10px] text-orange-300">Meses</p>
              <p className="text-sm font-bold text-orange-400">{collection.months_overdue}m</p>
            </div>
          </div>

          {/* Move stage */}
          <div className="flex items-center gap-2 p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
            <span className="text-xs text-gray-500 shrink-0">Mover a:</span>
            <select value={moveStage} onChange={e => setMoveStage(e.target.value)}
              className="flex-1 px-2 py-1 rounded-lg bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none">
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={handleMove} disabled={moveStage === collection.stage}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-medium disabled:opacity-30 hover:bg-amber-500/90">
              <ArrowRight size={12} /> Mover
            </button>
          </div>

          {/* Collection info (view/edit) */}
          <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400">Información del Caso</span>
              {!editing ? (
                <button onClick={handleEdit} className="text-xs text-amber-400 hover:underline">Editar</button>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-white">Cancelar</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500 text-white text-xs disabled:opacity-50">
                    <Save size={10} /> {saving ? "..." : "Guardar"}
                  </button>
                </div>
              )}
            </div>

            {!editing ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoRow label="Cobrador" value={collection.crm_collectors?.full_name || "Sin asignar"} />
                <InfoRow label="Plan" value={collection.plan_name || "—"} />
                <InfoRow label="Moneda" value={collection.currency} />
                <InfoRow label="Fuente" value={collection.source} />
                <InfoRow label="Último pago" value={collection.last_payment_date || "—"} />
                <InfoRow label="Deuda" value={fmtUSD(collection.amount_due)} />
                {collection.notes && <div className="col-span-2"><span className="text-gray-500">Notas:</span> <span className="text-gray-300">{collection.notes}</span></div>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Teléfono cliente" value={editForm.client_phone} onChange={v => setField("client_phone", v)} />
                  <EditField label="Email cliente" value={editForm.client_email} onChange={v => setField("client_email", v)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">Cobrador</label>
                    <select value={editForm.collector_id} onChange={e => setField("collector_id", e.target.value)}
                      className="w-full px-2 py-1 rounded bg-wuipi-card border border-wuipi-border text-xs text-gray-300 focus:outline-none">
                      <option value="">Sin asignar</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                  </div>
                  <EditField label="Plan" value={editForm.plan_name} onChange={v => setField("plan_name", v)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Deuda (USD)" value={editForm.amount_due} onChange={v => setField("amount_due", v)} type="number" />
                  <EditField label="Pagado (USD)" value={editForm.amount_paid} onChange={v => setField("amount_paid", v)} type="number" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <EditField label="Días en mora" value={editForm.days_overdue} onChange={v => setField("days_overdue", v)} type="number" />
                  <EditField label="Meses en mora" value={editForm.months_overdue} onChange={v => setField("months_overdue", v)} type="number" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-0.5">Notas</label>
                  <textarea value={editForm.notes} onChange={e => setField("notes", e.target.value)} rows={2}
                    className="w-full px-2 py-1 rounded bg-wuipi-card border border-wuipi-border text-xs text-white focus:outline-none resize-none" />
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
                <option value="payment_promise">Promesa de pago</option>
                <option value="payment_received">Pago recibido</option>
              </select>
              <textarea value={actDesc} onChange={e => setActDesc(e.target.value)} rows={2} placeholder="Descripción de la actividad..."
                className="flex-1 px-2 py-1.5 rounded-lg bg-wuipi-card border border-wuipi-border text-xs text-white placeholder-gray-600 focus:outline-none resize-none" />
              <button onClick={handleAddActivity} disabled={actSaving || !actDesc.trim()}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium disabled:opacity-30 hover:bg-amber-500/90 shrink-0">
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
