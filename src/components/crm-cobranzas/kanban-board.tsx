"use client";

import { DragEvent } from "react";
import { User, Clock, DollarSign, AlertTriangle } from "lucide-react";

// ============================================
// TYPES
// ============================================
export interface CrmCollection {
  id: string;
  code: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_id: string;
  stage: string;
  source: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  days_overdue: number;
  months_overdue: number;
  plan_name: string | null;
  stage_changed_at: string;
  created_at: string;
  crm_collectors?: { id: string; full_name: string; type: string } | null;
}

// ============================================
// STAGES CONFIG
// ============================================
export const STAGES = [
  { key: "leads_entrantes",       label: "Leads Entrantes",        color: "#f59e0b", bg: "bg-amber-400/10",    border: "border-amber-400/30",    text: "text-amber-400" },
  { key: "contacto_inicial",      label: "Contacto Inicial",       color: "#f97316", bg: "bg-orange-400/10",   border: "border-orange-400/30",   text: "text-orange-400" },
  { key: "info_enviada",          label: "Info Enviada / Espera",   color: "#eab308", bg: "bg-yellow-400/10",   border: "border-yellow-400/30",   text: "text-yellow-400" },
  { key: "no_clasificado",        label: "No Clasificado",          color: "#94a3b8", bg: "bg-slate-400/10",    border: "border-slate-400/30",    text: "text-slate-400" },
  { key: "gestion_suspendidos",   label: "Gestión Suspendidos",     color: "#ef4444", bg: "bg-red-400/10",      border: "border-red-400/30",      text: "text-red-400" },
  { key: "gestion_pre_retiro",    label: "Gestión Pre-Retiro",      color: "#fb7185", bg: "bg-rose-400/10",     border: "border-rose-400/30",     text: "text-rose-400" },
  { key: "gestion_cobranza",      label: "Gestión Cobranza",        color: "#3b82f6", bg: "bg-blue-400/10",     border: "border-blue-400/30",     text: "text-blue-400" },
  { key: "recuperado",            label: "Recuperado",              color: "#34d399", bg: "bg-emerald-400/10",  border: "border-emerald-400/30",  text: "text-emerald-400" },
  { key: "retirado_definitivo",   label: "Retirado Definitivo",     color: "#6b7280", bg: "bg-gray-400/10",     border: "border-gray-400/30",     text: "text-gray-400" },
] as const;

export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

// ============================================
// KANBAN BOARD
// ============================================
export default function KanbanBoard({ collections, draggingId, dragOverCol, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd, onClickCollection }: {
  collections: CrmCollection[];
  draggingId: string | null;
  dragOverCol: string | null;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, key: string) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>, key: string) => void;
  onDragEnd: () => void;
  onClickCollection: (c: CrmCollection) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "400px" }}>
      {STAGES.map(col => {
        const colItems = collections.filter(c => c.stage === col.key);
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
                  {colItems.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="p-2 space-y-2 min-h-[100px]">
              {colItems.map(item => (
                <KanbanCard key={item.id} collection={item} isDragging={draggingId === item.id}
                  onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onClickCollection(item)} />
              ))}
              {colItems.length === 0 && (
                <div className="text-center py-6 text-gray-700 text-xs">
                  Arrastra casos aquí
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
function KanbanCard({ collection, isDragging, onDragStart, onDragEnd, onClick }: {
  collection: CrmCollection;
  isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e as any, collection.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`p-2.5 rounded-lg bg-wuipi-card border border-wuipi-border hover:border-amber-400/30 cursor-pointer transition-all ${
        isDragging ? "opacity-40 scale-95" : ""
      }`}
    >
      {/* Top row: code + days overdue badge */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-gray-500">{collection.code}</span>
        {collection.days_overdue > 0 && (
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 ${
            collection.days_overdue > 90 ? "text-red-400 bg-red-400/10 border border-red-500/20" :
            collection.days_overdue > 30 ? "text-orange-400 bg-orange-400/10 border border-orange-500/20" :
            "text-amber-400 bg-amber-400/10 border border-amber-500/20"
          }`}>
            <AlertTriangle size={8} />
            {collection.days_overdue}d
          </span>
        )}
      </div>

      {/* Client name */}
      <p className="text-xs font-medium text-white leading-tight mb-2 line-clamp-2">{collection.client_name}</p>

      {/* Plan */}
      {collection.plan_name && (
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-gray-500 truncate">{collection.plan_name}</span>
        </div>
      )}

      {/* Amount due */}
      {collection.amount_due > 0 && (
        <div className="flex items-center gap-1 mb-2">
          <DollarSign size={10} className="text-red-400" />
          <span className="text-[10px] font-bold text-red-400">{fmtUSD(collection.amount_due)}</span>
          {collection.amount_paid > 0 && (
            <span className="text-[10px] text-emerald-400 ml-1">({fmtUSD(collection.amount_paid)} pagado)</span>
          )}
        </div>
      )}

      {/* Bottom row: collector + time in stage */}
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-1 truncate">
          <User size={10} />
          <span className="truncate">{collection.crm_collectors?.full_name || "Sin asignar"}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>{timeAgo(collection.stage_changed_at || collection.created_at)}</span>
        </div>
      </div>
    </div>
  );
}
