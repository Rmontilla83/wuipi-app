"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import {
  Plus, RefreshCw, ChevronLeft, Trash2, Archive, Send,
  Users, DollarSign, Clock, AlertCircle, CheckCircle2,
} from "lucide-react";
import { SegmentEditor } from "./segment-editor";

const fmtUSD = (n: number) => `$${(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => new Date(s).toLocaleString("es-VE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  exclude_recent_days: number;
  preview_count: number | null;
  preview_total_usd: number | null;
  preview_updated_at: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export default function SegmentsTab() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<{ campaign_id: string; items: number; total: number } | null>(null);

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cobranzas/segments${showArchived ? "?include_archived=true" : ""}`, { cache: "no-store" });
      const json = await res.json();
      setSegments(json.segments || []);
    } catch (err) {
      console.error("[segments] fetch fallo:", err);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  const openEdit = (id: string | null) => {
    setEditingId(id);
    setView("edit");
  };

  const handleArchive = async (id: string, archived: boolean) => {
    if (!confirm(archived ? "¿Archivar segmento?" : "¿Restaurar segmento archivado?")) return;
    await fetch(`/api/cobranzas/segments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: archived }),
    });
    fetchSegments();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Borrar segmento permanentemente? Las campañas previas mantienen su snapshot, pero el segmento desaparece.")) return;
    await fetch(`/api/cobranzas/segments/${id}`, { method: "DELETE" });
    fetchSegments();
  };

  const handleExecute = async (segment: Segment) => {
    if (!confirm(`¿Lanzar campaña con segmento "${segment.name}"?\n\nVa a crear ${segment.preview_count ?? "?"} items materializados al estado actual de Odoo.`)) return;
    setExecutingId(segment.id);
    setExecuteResult(null);
    try {
      const res = await fetch(`/api/cobranzas/segments/${segment.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "Error al ejecutar segmento");
        return;
      }
      setExecuteResult({ campaign_id: json.campaign_id, items: json.items_created, total: json.total_usd });
      fetchSegments();  // refresh para ver preview cache actualizado
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setExecutingId(null);
    }
  };

  if (view === "edit") {
    return (
      <SegmentEditor
        segmentId={editingId}
        onBack={() => { setView("list"); setEditingId(null); fetchSegments(); }}
        onExecute={(id) => {
          const seg = segments.find((s) => s.id === id);
          if (seg) handleExecute(seg);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Segmentos de cobranza</h3>
          <p className="text-sm text-gray-500">Filtros guardados que se ejecutan contra Odoo. Reusables.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Mostrar archivados
          </label>
          <button
            onClick={fetchSegments}
            className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => openEdit(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90"
          >
            <Plus size={16} /> Nuevo segmento
          </button>
        </div>
      </div>

      {/* Result banner tras ejecución exitosa */}
      {executeResult && (
        <Card className="!p-4 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <div className="flex-1">
              <p className="text-emerald-400 font-medium text-sm">Campaña creada — {executeResult.items} items / {fmtUSD(executeResult.total)}</p>
              <p className="text-emerald-300/60 text-xs mt-0.5">Va a la pestaña &ldquo;Campañas de Cobro&rdquo; para enviarla.</p>
            </div>
            <button onClick={() => setExecuteResult(null)} className="text-emerald-400 hover:text-white text-xs">Cerrar</button>
          </div>
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
        </div>
      ) : segments.length === 0 ? (
        <Card className="text-center py-12">
          <Users size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-sm mb-1">No hay segmentos {showArchived ? "" : "activos"}</p>
          <p className="text-gray-600 text-xs">Crea tu primer segmento para filtrar clientes con criterios complejos</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {segments.map((s) => {
            const filterCount = Object.keys(s.filters || {}).filter((k) => {
              const v = (s.filters as Record<string, unknown>)[k];
              return v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true);
            }).length;
            return (
              <Card key={s.id} className={`!p-4 ${s.is_archived ? "opacity-50" : "hover:border-[#F46800]/30"} transition-colors`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(s.id)}>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-medium truncate">{s.name}</h4>
                      {s.is_archived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-400/10 text-gray-400">
                          Archivado
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-400/10 text-blue-400">
                        {filterCount} filtros
                      </span>
                      {s.exclude_recent_days > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/10 text-amber-400">
                          <Clock size={9} className="inline mr-0.5" />
                          Anti-spam {s.exclude_recent_days}d
                        </span>
                      )}
                    </div>
                    {s.description && <p className="text-gray-500 text-xs truncate">{s.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      {s.preview_count !== null ? (
                        <>
                          <span className="text-gray-300 flex items-center gap-1">
                            <Users size={12} className="text-gray-500" /> {s.preview_count} clientes
                          </span>
                          <span className="text-emerald-400 flex items-center gap-1">
                            <DollarSign size={12} /> {fmtUSD(s.preview_total_usd || 0)}
                          </span>
                          <span className="text-gray-600">
                            actualizado {s.preview_updated_at ? fmtDate(s.preview_updated_at) : "—"}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-600 italic">Sin preview — abrí el segmento para calcular</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!s.is_archived && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleExecute(s); }}
                        disabled={executingId === s.id || s.preview_count === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-medium disabled:opacity-30"
                        title="Lanzar campaña con este segmento"
                      >
                        {executingId === s.id ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        Lanzar
                      </button>
                    )}
                    <button
                      onClick={() => handleArchive(s.id, !s.is_archived)}
                      className="p-2 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-400/10"
                      title={s.is_archived ? "Restaurar" : "Archivar"}
                    >
                      <Archive size={14} />
                    </button>
                    {s.is_archived && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10"
                        title="Borrar permanentemente"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
