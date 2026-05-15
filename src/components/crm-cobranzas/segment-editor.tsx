"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { ChevronLeft, RefreshCw, Save, Send, Eye } from "lucide-react";

const fmtUSD = (n: number) => `$${(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type DocType = "V" | "J" | "G" | "E" | "P";

const DOC_TYPES: DocType[] = ["V", "J", "G", "E", "P"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const SUB_STATES = [
  { value: "1_draft", label: "Borrador" },
  { value: "2_renewal", label: "Renovación" },
  { value: "3_progress", label: "En curso" },
  { value: "4_paused", label: "Pausada" },
  { value: "5_renewed", label: "Renovada" },
  { value: "6_churn", label: "Cancelada" },
];

interface Filters {
  amount_total?: { min?: number; max?: number };
  amount_per_invoice?: { min?: number; max?: number };
  overdue_days?: { min?: number; max?: number };
  due_date?: { from?: string; to?: string };
  draft_count?: { min?: number; max?: number };
  doc_type?: DocType[];
  is_company?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  city?: string;
  exclude_credit?: boolean;
  subscription_state?: string[];
  billed_month?: string[];
  search?: string;
}

interface PreviewResult {
  count: number;
  total_usd: number;
  sample: Array<{
    odoo_partner_id: number;
    customer_name: string;
    customer_cedula_rif: string;
    customer_email: string;
    is_company: boolean;
    city: string;
    invoice_count: number;
    total_due_usd: number;
    oldest_due_date: string;
    overdue_days: number;
  }>;
  excluded_recent_count: number;
}

export function SegmentEditor({
  segmentId,
  onBack,
  onExecute,
}: {
  segmentId: string | null;
  onBack: () => void;
  onExecute: (id: string) => void;
}) {
  const isNew = !segmentId;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [excludeRecentDays, setExcludeRecentDays] = useState(0);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar segmento existente
  useEffect(() => {
    if (!segmentId) return;
    fetch(`/api/cobranzas/segments/${segmentId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.segment) {
          const s = json.segment;
          setName(s.name);
          setDescription(s.description || "");
          setFilters(s.filters || {});
          setExcludeRecentDays(s.exclude_recent_days || 0);
        }
      })
      .finally(() => setLoading(false));
  }, [segmentId]);

  // Preview live debounced
  const runPreview = useCallback(async (currentFilters: Filters, excludeDays: number) => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/cobranzas/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ filters: currentFilters, exclude_recent_days: excludeDays }),
      });
      const json = await res.json();
      if (res.ok) setPreview(json);
      else setPreview(null);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Debounce preview cuando cambian los filtros
  useEffect(() => {
    if (loading) return;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      runPreview(filters, excludeRecentDays);
    }, 600);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [filters, excludeRecentDays, runPreview, loading]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const url = isNew ? "/api/cobranzas/segments" : `/api/cobranzas/segments/${segmentId}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, filters, exclude_recent_days: excludeRecentDays }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      if (isNew && json.segment?.id) {
        // Quedarse en edición del recién creado
        window.history.replaceState(null, "", window.location.pathname);
      }
      onBack();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndExecute = async () => {
    if (!name.trim()) {
      alert("Guarda primero con un nombre");
      return;
    }
    if (!preview || preview.count === 0) {
      alert("Sin clientes que cumplan los filtros");
      return;
    }
    setSaving(true);
    try {
      const url = isNew ? "/api/cobranzas/segments" : `/api/cobranzas/segments/${segmentId}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, filters, exclude_recent_days: excludeRecentDays }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al guardar");
      const id = json.segment?.id || segmentId;
      if (id) {
        onBack();
        onExecute(id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  // Filter helpers
  const setRange = (key: "amount_total" | "amount_per_invoice" | "overdue_days" | "draft_count", which: "min" | "max", val: string) => {
    const num = val === "" ? undefined : parseFloat(val);
    setFilters((f) => {
      const r = { ...(f[key] || {}) };
      if (num === undefined) delete (r as Record<string, unknown>)[which]; else (r as Record<string, number>)[which] = num;
      const cleaned = Object.keys(r).length > 0 ? r : undefined;
      return { ...f, [key]: cleaned };
    });
  };

  const setDateRange = (which: "from" | "to", val: string) => {
    setFilters((f) => {
      const r = { ...(f.due_date || {}) };
      if (!val) delete (r as Record<string, unknown>)[which]; else (r as Record<string, string>)[which] = val;
      return { ...f, due_date: Object.keys(r).length > 0 ? r : undefined };
    });
  };

  const toggleArrayFilter = <T extends string>(key: "doc_type" | "subscription_state" | "billed_month", value: T) => {
    setFilters((f) => {
      const current = (f[key] as T[] | undefined) || [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...f, [key]: next.length > 0 ? next : undefined };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white">
          <ChevronLeft size={16} />
        </button>
        <div>
          <h3 className="text-lg font-semibold text-white">{isNew ? "Nuevo segmento" : "Editar segmento"}</h3>
          <p className="text-sm text-gray-500">Filtros que se ejecutan contra Odoo en vivo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna izquierda: Form + Filtros */}
        <div className="lg:col-span-2 space-y-4">
          {/* Datos básicos */}
          <Card className="!p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Nombre *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Morosos +30 días Lechería"
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Descripción</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para qué sirve este segmento"
                maxLength={1000}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Anti-spam: excluir clientes contactados en los últimos N días (0 = desactivado)
              </label>
              <input
                type="number"
                min={0}
                value={excludeRecentDays}
                onChange={(e) => setExcludeRecentDays(parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
              />
            </div>
          </Card>

          {/* Filtros — Monto */}
          <Card className="!p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">💰 Monto</h4>
            <div className="grid grid-cols-2 gap-3">
              <RangeInput label="Total adeudado USD min/max" value={filters.amount_total} onChange={(w, v) => setRange("amount_total", w, v)} />
              <RangeInput label="Por factura individual USD" value={filters.amount_per_invoice} onChange={(w, v) => setRange("amount_per_invoice", w, v)} />
            </div>
            <RangeInput label="Cantidad de drafts del cliente" value={filters.draft_count} onChange={(w, v) => setRange("draft_count", w, v)} />
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={!!filters.exclude_credit} onChange={(e) => setFilters((f) => ({ ...f, exclude_credit: e.target.checked || undefined }))} />
              Excluir clientes con saldo a favor (credit &lt; 0)
            </label>
          </Card>

          {/* Filtros — Antigüedad / Fechas */}
          <Card className="!p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white">📅 Antigüedad y fechas</h4>
            <RangeInput label="Días de mora (vs hoy)" value={filters.overdue_days} onChange={(w, v) => setRange("overdue_days", w, v)} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Vencimiento desde</label>
                <input
                  type="date"
                  value={filters.due_date?.from || ""}
                  onChange={(e) => setDateRange("from", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Vencimiento hasta</label>
                <input
                  type="date"
                  value={filters.due_date?.to || ""}
                  onChange={(e) => setDateRange("to", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-2">Mes facturado (cliente con ≥1 factura del mes)</label>
              <div className="flex flex-wrap gap-1.5">
                {MESES.map((m) => {
                  const active = (filters.billed_month || []).includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleArrayFilter("billed_month", m)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        active ? "bg-[#F46800] text-white" : "bg-wuipi-bg text-gray-400 hover:text-white border border-wuipi-border"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Filtros — Cliente */}
          <Card className="!p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white">👥 Cliente</h4>
            <div>
              <label className="text-xs text-gray-400 block mb-2">Tipo de documento</label>
              <div className="flex gap-1.5">
                {DOC_TYPES.map((t) => {
                  const active = (filters.doc_type || []).includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleArrayFilter("doc_type", t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-colors ${
                        active ? "bg-[#F46800] text-white" : "bg-wuipi-bg text-gray-400 hover:text-white border border-wuipi-border"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">¿Es empresa?</label>
                <select
                  value={filters.is_company === undefined ? "" : filters.is_company ? "true" : "false"}
                  onChange={(e) => setFilters((f) => ({ ...f, is_company: e.target.value === "" ? undefined : e.target.value === "true" }))}
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
                >
                  <option value="">Indistinto</option>
                  <option value="true">Solo empresas</option>
                  <option value="false">Solo personas</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Ciudad (ilike)</label>
                <input
                  value={filters.city || ""}
                  onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value || undefined }))}
                  placeholder="Lechería, Caracas..."
                  className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={!!filters.has_email} onChange={(e) => setFilters((f) => ({ ...f, has_email: e.target.checked || undefined }))} />
                Tiene email
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={!!filters.has_phone} onChange={(e) => setFilters((f) => ({ ...f, has_phone: e.target.checked || undefined }))} />
                Tiene teléfono
              </label>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Búsqueda libre por nombre</label>
              <input
                value={filters.search || ""}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
                placeholder="Parte del nombre del cliente"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
              />
            </div>
          </Card>

          {/* Filtros — Suscripción */}
          <Card className="!p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white">📦 Suscripción</h4>
            <div>
              <label className="text-xs text-gray-400 block mb-2">Estado de la suscripción</label>
              <div className="flex flex-wrap gap-1.5">
                {SUB_STATES.map((s) => {
                  const active = (filters.subscription_state || []).includes(s.value);
                  return (
                    <button
                      key={s.value}
                      onClick={() => toggleArrayFilter("subscription_state", s.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        active ? "bg-[#F46800] text-white" : "bg-wuipi-bg text-gray-400 hover:text-white border border-wuipi-border"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Columna derecha: Preview live + actions */}
        <div className="space-y-4">
          <Card className="!p-4 sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                <Eye size={14} /> Preview en vivo
              </h4>
              {previewLoading && <RefreshCw size={14} className="animate-spin text-gray-500" />}
            </div>

            {preview ? (
              <>
                <div className="space-y-2 mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-400">Clientes</span>
                    <span className="text-2xl font-bold text-white">{preview.count}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-400">Total USD</span>
                    <span className="text-lg font-semibold text-emerald-400">{fmtUSD(preview.total_usd)}</span>
                  </div>
                  {preview.excluded_recent_count > 0 && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-amber-400">Excluidos (anti-spam)</span>
                      <span className="text-xs text-amber-400">{preview.excluded_recent_count}</span>
                    </div>
                  )}
                </div>

                {preview.sample.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase mb-2">Top 5 clientes</p>
                    <div className="space-y-1.5">
                      {preview.sample.slice(0, 5).map((c) => (
                        <div key={c.odoo_partner_id} className="text-xs flex justify-between gap-2">
                          <span className="text-gray-300 truncate">{c.customer_name}</span>
                          <span className="text-emerald-400 whitespace-nowrap">{fmtUSD(c.total_due_usd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-wuipi-border mt-4 pt-4 space-y-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#03318C] text-white text-sm font-medium hover:bg-[#03318C]/90 disabled:opacity-50"
                  >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                    {isNew ? "Guardar segmento" : "Actualizar"}
                  </button>
                  <button
                    onClick={handleSaveAndExecute}
                    disabled={saving || !name.trim() || preview.count === 0}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Send size={14} />
                    Guardar y lanzar campaña
                  </button>
                </div>
              </>
            ) : previewLoading ? (
              <div className="text-center py-8 text-gray-500 text-xs">Calculando...</div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-xs">Ajustá los filtros para ver el preview</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { min?: number; max?: number } | undefined;
  onChange: (which: "min" | "max", val: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder="min"
          value={value?.min ?? ""}
          onChange={(e) => onChange("min", e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
        />
        <input
          type="number"
          placeholder="max"
          value={value?.max ?? ""}
          onChange={(e) => onChange("max", e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
        />
      </div>
    </div>
  );
}
