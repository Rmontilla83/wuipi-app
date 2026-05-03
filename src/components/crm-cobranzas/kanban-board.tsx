"use client";

import { DragEvent } from "react";
import { User, Clock, DollarSign, AlertTriangle } from "lucide-react";
import { COBRANZAS_STAGES, COBRANZAS_PHASES, COBRANZAS_STAGE_MAP } from "@/lib/cobranzas/stages";

// ============================================
// TYPES
// ============================================
export interface CrmCollection {
  id: string;
  code: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  client_id: string | null;
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
  // Stream A4 fields
  source_collection_item_id?: string | null;
  closed_at?: string | null;
  failure_metadata?: {
    gateway?: string;
    gateway_product?: string;
    failure_type?: string;
    error_code?: string;
    error_message?: string;
  } | null;
  last_wa_sent_at?: string | null;
  crm_collectors?: { id: string; full_name: string; type: string } | null;
}

// ============================================
// STAGES — re-export from shared module (Stream A4)
// ============================================
// Las stages viven en src/lib/cobranzas/stages.ts (compartido entre kanban,
// helpers de auto-ticket, validations, etc.). Mantenemos los re-exports con
// los nombres viejos para no romper imports existentes en el codebase.

export const STAGES = COBRANZAS_STAGES;
export const STAGE_MAP = COBRANZAS_STAGE_MAP;

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

// ============================================
// VISUAL TAGS — chips contextuales en la card
// ============================================
// Tags propuestos en cobranzas-instruction.md:
//   🟠 PRE-CORTE       — entre dia 5 y 8 (antes del corte)
//   🟡 POST-CORTE      — entre dia 9 y 38 (post corte automatico)
//   🔴 ULTIMA OPP      — stage ultima_oportunidad
//   📅 SUSP-TEMPORAL   — cliente con tilde no_suspender o suspension_temporal (futuro)
//   ⚠️  PROMESA ROTA   — stage compromiso_pago con deadline vencido (futuro)
//   💵 ERROR PASARELA  — source payment_failure (Stream A4)

interface VisualTag {
  emoji: string;
  label: string;
  color: string;  // tailwind class
}

function computeTags(c: CrmCollection): VisualTag[] {
  const tags: VisualTag[] = [];

  // ERROR PASARELA — viene de payment_failure
  if (c.source === "payment_failure" || c.stage === "falla_pasarela") {
    tags.push({ emoji: "💵", label: "ERROR PASARELA", color: "text-red-400 bg-red-500/10 border border-red-500/20" });
  }

  // ULTIMA OPP
  if (c.stage === "ultima_oportunidad") {
    tags.push({ emoji: "🔴", label: "ULTIMA OPP", color: "text-violet-400 bg-violet-500/10 border border-violet-500/20" });
  }

  // PRE-CORTE / POST-CORTE basado en days_overdue
  if (c.days_overdue >= 5 && c.days_overdue <= 8) {
    tags.push({ emoji: "🟠", label: "PRE-CORTE", color: "text-orange-400 bg-orange-500/10 border border-orange-500/20" });
  } else if (c.days_overdue >= 9 && c.days_overdue <= 38) {
    tags.push({ emoji: "🟡", label: "POST-CORTE", color: "text-amber-400 bg-amber-500/10 border border-amber-500/20" });
  }

  return tags;
}

// ============================================
// KANBAN BOARD — agrupa por fase (accion / espera / cerrado)
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
    <div className="space-y-4">
      {COBRANZAS_PHASES.map(phase => {
        const phaseStages = COBRANZAS_STAGES.filter(s => s.phase === phase.key);
        return (
          <div key={phase.key}>
            {/* Phase header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: phase.color }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {phase.label}
              </span>
              <div className="flex-1 h-px bg-wuipi-border/30" />
            </div>

            {/* Phase columns */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {phaseStages.map(col => {
                const colItems = collections.filter(c => c.stage === col.key);
                const isOver = dragOverCol === col.key;
                return (
                  <div key={col.key}
                    className={`flex-shrink-0 w-[260px] rounded-xl border transition-colors ${
                      isOver ? `${col.border} ${col.bg}` : "border-wuipi-border/50 bg-wuipi-bg/30"
                    }`}
                    onDragOver={(e) => onDragOver(e as DragEvent<HTMLDivElement>, col.key)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e as DragEvent<HTMLDivElement>, col.key)}
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
                          {col.entry === "auto" ? "Auto desde fallos" : "Arrastra casos aquí"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
  const tags = computeTags(collection);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e as DragEvent<HTMLDivElement>, collection.id)}
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

      {/* Visual tags (ERROR PASARELA, PRE-CORTE, etc.) */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-flex items-center gap-0.5 ${tag.color}`}
            >
              <span>{tag.emoji}</span>
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* Client name */}
      <p className="text-xs font-medium text-white leading-tight mb-2 line-clamp-2">{collection.client_name}</p>

      {/* Plan or failure reason (if from payment failure) */}
      {collection.failure_metadata?.failure_type ? (
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          <span className="text-[10px] text-gray-400 truncate" title={collection.failure_metadata.error_message || ""}>
            {collection.failure_metadata.gateway} — {collection.failure_metadata.failure_type.replace(/_/g, " ")}
          </span>
        </div>
      ) : collection.plan_name ? (
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-gray-500 truncate">{collection.plan_name}</span>
        </div>
      ) : null}

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
