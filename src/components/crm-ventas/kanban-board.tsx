"use client";

import { DragEvent } from "react";
import { User, Clock, DollarSign, GripVertical } from "lucide-react";

// ============================================
// TYPES
// ============================================
export interface CrmLead {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage: string;
  source: string;
  value: number;
  stage_changed_at: string;
  created_at: string;
  crm_products?: { id: string; name: string; category: string } | null;
  crm_salespeople?: { id: string; full_name: string; type: string } | null;
}

// ============================================
// STAGES CONFIG
// ============================================
export const STAGES = [
  { key: "incoming",               label: "Incoming Leads",         color: "#22d3ee", bg: "bg-cyan-400/10",    border: "border-cyan-400/30",    text: "text-cyan-400" },
  { key: "contacto_inicial",       label: "Contacto Inicial",       color: "#3b82f6", bg: "bg-blue-400/10",    border: "border-blue-400/30",    text: "text-blue-400" },
  { key: "info_enviada",           label: "Info Enviada / Espera",  color: "#6366f1", bg: "bg-indigo-400/10",  border: "border-indigo-400/30",  text: "text-indigo-400" },
  { key: "en_instalacion",         label: "Proceso Instalación",    color: "#f59e0b", bg: "bg-amber-400/10",   border: "border-amber-400/30",   text: "text-amber-400" },
  { key: "no_factible",            label: "No Factible",            color: "#6b7280", bg: "bg-gray-400/10",    border: "border-gray-400/30",    text: "text-gray-400" },
  { key: "no_concretado",          label: "No Concretado",          color: "#ef4444", bg: "bg-red-400/10",     border: "border-red-400/30",     text: "text-red-400" },
  { key: "no_clasificado",         label: "No Clasificado",         color: "#94a3b8", bg: "bg-slate-400/10",   border: "border-slate-400/30",   text: "text-slate-400" },
  { key: "retirado_reactivacion",  label: "Retirado / Reactivación",color: "#f97316", bg: "bg-orange-400/10",  border: "border-orange-400/30",  text: "text-orange-400" },
  { key: "prueba_actualizacion",   label: "Prueba / Actualización", color: "#a855f7", bg: "bg-purple-400/10",  border: "border-purple-400/30",  text: "text-purple-400" },
  { key: "ganado",                 label: "Ganado",                 color: "#34d399", bg: "bg-emerald-400/10", border: "border-emerald-400/30", text: "text-emerald-400" },
] as const;

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WA", web: "Web", referido: "Ref", social: "Social", other: "Otro",
};

const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ============================================
// KANBAN BOARD
// ============================================
export default function KanbanBoard({ leads, draggingId, dragOverCol, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onClickLead }: {
  leads: CrmLead[];
  draggingId: string | null;
  dragOverCol: string | null;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, key: string) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, key: string) => void;
  onDragEnd: () => void;
  onClickLead: (lead: CrmLead) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "400px" }}>
      {STAGES.map(col => {
        const colLeads = leads.filter(l => l.stage === col.key);
        const isOver = dragOverCol === col.key;
        return (
          <div key={col.key}
            className={`flex-shrink-0 w-[240px] rounded-xl border transition-colors ${
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
                  {colLeads.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 min-h-[100px]">
              {colLeads.map(lead => (
                <KanbanCard key={lead.id} lead={lead} isDragging={draggingId === lead.id}
                  onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onClickLead(lead)} />
              ))}
              {colLeads.length === 0 && (
                <div className="text-center py-6 text-gray-700 text-xs">
                  Arrastra leads aquí
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
function KanbanCard({ lead, isDragging, onDragStart, onDragEnd, onClick }: {
  lead: CrmLead;
  isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e as any, lead.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`p-2.5 rounded-lg bg-wuipi-card border border-wuipi-border hover:border-wuipi-accent/30 cursor-pointer transition-all ${
        isDragging ? "opacity-40 scale-95" : ""
      }`}
    >
      {/* Top row: code + source */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-gray-500">{lead.code}</span>
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-400 bg-gray-400/10 border border-gray-500/20">
          {SOURCE_LABELS[lead.source] || lead.source}
        </span>
      </div>

      {/* Name */}
      <p className="text-xs font-medium text-white leading-tight mb-2 line-clamp-2">{lead.name}</p>

      {/* Product */}
      {lead.crm_products && (
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-wuipi-accent" />
          <span className="text-[10px] text-gray-500 truncate">{lead.crm_products.name}</span>
        </div>
      )}

      {/* Value */}
      {lead.value > 0 && (
        <div className="flex items-center gap-1 mb-2">
          <DollarSign size={10} className="text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400">{fmtUSD(lead.value)}</span>
        </div>
      )}

      {/* Bottom row: salesperson + time */}
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-1 truncate">
          <User size={10} />
          <span className="truncate">{lead.crm_salespeople?.full_name || "Sin asignar"}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>{timeAgo(lead.stage_changed_at || lead.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
