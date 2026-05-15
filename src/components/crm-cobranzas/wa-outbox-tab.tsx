"use client";

// Tab "WA Outbox" — visibilidad y testing del riel de WhatsApp Cobranzas.
// Muestra que mensajes se enviaron / habrian enviado (dry-run) y permite
// dispararar pruebas manuales contra cualquier template aprobado.

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Search, Send, X, AlertTriangle, CheckCircle2,
  Clock, EyeOff, Eye, Filter, MessageSquare, ShieldAlert,
} from "lucide-react";

// ----- Types ---------------------------------------------------------

interface OutboxRow {
  id: string;
  customer_phone: string;
  customer_phone_masked: string | null;
  customer_name: string | null;
  template_name: string;
  template_lang: string;
  template_params: Record<string, string> | null;
  fallback_text: string | null;
  trigger_event: string;
  collection_item_id: string | null;
  crm_collection_id: string | null;
  status: "queued" | "dry_run" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  meta_message_id: string | null;
  meta_response: Record<string, unknown> | null;
  error_message: string | null;
  dry_run: boolean;
  created_at: string;
}

interface TemplateOption {
  key: string;
  name: string;
  description: string;
  body: string;
  buttons: Array<{ type: string; text: string; url?: string }>;
  variable_keys: string[];
  sample_params: Record<string, string>;
}

// ----- Constants ----------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  queued:   { label: "En cola",   color: "text-blue-400 bg-blue-500/10 border-blue-500/30",       icon: Clock },
  dry_run:  { label: "Dry-run",   color: "text-violet-400 bg-violet-500/10 border-violet-500/30", icon: EyeOff },
  sent:     { label: "Enviado",   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  failed:   { label: "Falló",     color: "text-red-400 bg-red-500/10 border-red-500/30",         icon: AlertTriangle },
  skipped:  { label: "Skip",      color: "text-gray-400 bg-gray-500/10 border-gray-500/30",       icon: X },
};

const TRIGGER_EVENT_LABELS: Record<string, string> = {
  payment_failure_case: "Falla de pasarela",
  collection_calendar_d27: "Día 27 — Factura nueva",
  collection_calendar_d1: "Día 1 — Inicio mes",
  collection_calendar_d3: "Día 3 — Suave",
  collection_calendar_d5: "Día 5 — Firme",
  collection_calendar_d7: "Día 7 — Urgente",
  collection_calendar_d8: "Día 8 — Post-corte",
  collection_calendar_d15: "Día 15 — Consulta",
  collection_calendar_d20: "Día 20 — Promesa rota",
  collection_calendar_d38: "Día 38 — Última opp",
  manual_test: "Prueba manual",
  bot_response: "Respuesta del bot",
};

// ----- Component ----------------------------------------------------

export default function WAOutboxTab() {
  const [items, setItems] = useState<OutboxRow[]>([]);
  const [mode, setMode] = useState<"dry_run" | "live">("dry_run");
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [triggerFilter, setTriggerFilter] = useState("");
  const [selected, setSelected] = useState<OutboxRow | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (triggerFilter) params.set("trigger_event", triggerFilter);
      params.set("limit", "200");

      const res = await fetch(`/api/cobranzas/wa-outbox?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setItems(json.items || []);
        setMode(json.mode || "dry_run");
        setKpis(json.kpis_24h || {});
      }
    } catch (err) {
      console.error("[WAOutbox] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, triggerFilter]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  return (
    <div className="space-y-4">
      {/* Disclaimer claro: este tab es del riel EXPERIMENTAL. Las campañas
          de cobranza reales usan un sistema diferente (sendCollectionWhatsApp
          → collection_notifications) que va directo a Meta sin dry-run.
          El modo aquí solo afecta a pruebas manuales + el botón "Invitar al
          portal" (que usa forceLive=true para ignorar el dry-run global). */}
      <Card className="!p-4 border-amber-500/40 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-relaxed">
            <p className="text-amber-300 font-bold uppercase tracking-wide mb-1">
              Este tab muestra solo el riel experimental
            </p>
            <p className="text-gray-300">
              Las <strong>campañas de cobranza reales</strong> usan otro sistema
              (helper <code className="text-[10px] bg-black/30 px-1 rounded">sendCollectionWhatsApp</code>) y los WA salen directo a Meta — su tracking
              vive en <strong>Cobranza → Campañas de Cobro → abrir campaña</strong>,
              no acá.
            </p>
            <p className="text-gray-400 mt-1.5">
              Acá solo hay: prueba manual de templates aprobados, mensajes del
              botón &ldquo;Invitar al portal&rdquo; (siempre reales, ignora dry-run),
              y eventos futuros del calendario D27/D1/D3/D5/D7/D8/D15/D20/D38
              (en construcción).
            </p>
          </div>
        </div>
      </Card>

      {/* Indicador del modo del riel experimental — más chico que antes */}
      <Card className={`!p-3 ${mode === "live" ? "border-red-500/30 bg-red-500/5" : "border-violet-500/30 bg-violet-500/5"}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            {mode === "live" ? (
              <ShieldAlert className="text-red-400 shrink-0" size={18} />
            ) : (
              <EyeOff className="text-violet-400 shrink-0" size={18} />
            )}
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${mode === "live" ? "text-red-400" : "text-violet-400"}`}>
                Riel experimental: {mode === "live" ? "MODO REAL" : "MODO DRY-RUN"}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {mode === "live"
                  ? "COBRANZAS_WA_DRY_RUN=false. Pruebas manuales van a Meta."
                  : "Pruebas manuales solo se registran acá, no llegan al cliente."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowTestModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-500/90 transition-colors"
          >
            <Send size={12} /> Enviar prueba
          </button>
        </div>
      </Card>

      {/* KPI strip 24h */}
      {Object.keys(kpis).length > 0 && (
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="text-gray-500">Últimas 24h:</span>
          {Object.entries(kpis).map(([status, count]) => {
            const cfg = STATUS_CONFIG[status];
            return (
              <span key={status} className={`px-2 py-1 rounded border ${cfg?.color || "border-wuipi-border text-gray-400"}`}>
                {cfg?.label || status}: <strong>{count}</strong>
              </span>
            );
          })}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Outbox WhatsApp</h3>
          <p className="text-sm text-gray-500">Mensajes del riel de Cobranzas (cobranzas_wa_outbox)</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filtros */}
      <Card className="!p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, teléfono, template..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-violet-400/50 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
          >
            <option value="all">Todos los status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={triggerFilter}
            onChange={(e) => setTriggerFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
          >
            <option value="">Todos los triggers</option>
            {Object.entries(TRIGGER_EVENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Tabla */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-wuipi-card z-10">
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-2 pl-3 font-medium">Hora</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Trigger</th>
                <th className="text-left p-2 font-medium">Template</th>
                <th className="text-left p-2 font-medium">Cliente / Teléfono</th>
                <th className="text-left p-2 pr-3 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                  <RefreshCw size={16} className="inline animate-spin mr-2" /> Cargando...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-gray-500">
                  <MessageSquare size={32} className="mx-auto mb-2 text-gray-700" />
                  <p>No hay mensajes en el outbox aún.</p>
                  <p className="text-xs text-gray-600 mt-1">Cuando una pasarela falle o el cron de abandonos detecte uno, aparecerán aquí.</p>
                </td></tr>
              ) : items.map(it => {
                const cfg = STATUS_CONFIG[it.status];
                const Icon = cfg?.icon || Clock;
                return (
                  <tr
                    key={it.id}
                    onClick={() => setSelected(it)}
                    className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover cursor-pointer"
                  >
                    <td className="p-2 pl-3 text-[10px] text-gray-400 font-mono whitespace-nowrap">
                      {new Date(it.created_at).toLocaleString("es-VE", {
                        day: "2-digit", month: "2-digit",
                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </td>
                    <td className="p-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${cfg?.color || ""}`}>
                        <Icon className="w-3 h-3" />
                        {cfg?.label || it.status}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-gray-400">
                      {TRIGGER_EVENT_LABELS[it.trigger_event] || it.trigger_event}
                    </td>
                    <td className="p-2 text-xs text-gray-300 font-mono truncate max-w-[180px]">
                      {it.template_name}
                    </td>
                    <td className="p-2 text-xs">
                      <p className="text-white truncate max-w-[150px]">{it.customer_name || "—"}</p>
                      <p className="text-[10px] text-gray-600 font-mono">{it.customer_phone_masked || it.customer_phone}</p>
                    </td>
                    <td className="p-2 pr-3 text-xs text-gray-400 truncate max-w-[200px]">
                      {it.meta_message_id ? (
                        <span className="text-emerald-400 font-mono text-[10px]" title={it.meta_message_id}>
                          {it.meta_message_id.slice(-12)}
                        </span>
                      ) : it.error_message ? (
                        <span className="text-red-400 text-[10px]" title={it.error_message}>
                          {it.error_message.slice(0, 40)}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de detalle */}
      {selected && (
        <DetailModal row={selected} onClose={() => setSelected(null)} />
      )}

      {/* Modal de envío de prueba */}
      {showTestModal && (
        <TestModal
          mode={mode}
          onClose={() => setShowTestModal(false)}
          onSent={() => {
            setShowTestModal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ============================================
// DETAIL MODAL — body renderizado + meta response
// ============================================
function DetailModal({ row, onClose }: { row: OutboxRow; onClose: () => void }) {
  const renderedBody = row.fallback_text || "(sin fallback)";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">Mensaje WhatsApp</h2>
            <p className="text-xs text-gray-500 font-mono">{row.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Status badges */}
          <div className="flex gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded border ${STATUS_CONFIG[row.status]?.color}`}>
              {STATUS_CONFIG[row.status]?.label || row.status}
            </span>
            {row.dry_run && (
              <span className="px-2 py-1 rounded border border-violet-500/30 text-violet-400">
                DRY-RUN
              </span>
            )}
          </div>

          {/* Vista previa del mensaje (formato WA) */}
          <div>
            <p className="text-gray-500 font-medium mb-2 flex items-center gap-1">
              <Eye size={12} /> Cómo lo ve el cliente
            </p>
            <div className="rounded-lg p-3 bg-emerald-500/5 border border-emerald-500/20">
              <pre className="whitespace-pre-wrap text-gray-200 font-sans text-sm">{renderedBody}</pre>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Trigger" value={TRIGGER_EVENT_LABELS[row.trigger_event] || row.trigger_event} />
            <Field label="Template" value={row.template_name} mono />
            <Field label="Idioma" value={row.template_lang} />
            <Field label="Teléfono" value={row.customer_phone_masked || row.customer_phone} mono />
            <Field label="Cliente" value={row.customer_name || "—"} />
            <Field label="Creado" value={new Date(row.created_at).toLocaleString("es-VE")} />
            {row.sent_at && <Field label="Enviado" value={new Date(row.sent_at).toLocaleString("es-VE")} />}
            {row.meta_message_id && <Field label="Meta msg ID" value={row.meta_message_id} mono />}
          </div>

          {row.template_params && Object.keys(row.template_params).length > 0 && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Variables del template</p>
              <pre className="bg-wuipi-bg border border-wuipi-border rounded-lg p-3 overflow-x-auto text-[10px] text-gray-300">
                {JSON.stringify(row.template_params, null, 2)}
              </pre>
            </div>
          )}

          {row.error_message && (
            <div>
              <p className="text-red-400 font-medium mb-1">Error</p>
              <pre className="bg-red-500/5 border border-red-500/30 rounded-lg p-3 overflow-x-auto text-[10px] text-red-300">
                {row.error_message}
              </pre>
            </div>
          )}

          {row.meta_response && (
            <div>
              <p className="text-gray-500 font-medium mb-1">Respuesta de Meta</p>
              <pre className="bg-wuipi-bg border border-wuipi-border rounded-lg p-3 overflow-x-auto text-[10px] text-gray-300 max-h-48">
                {JSON.stringify(row.meta_response, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-wuipi-border/30 pb-1">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</p>
      <p className={`text-gray-300 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ============================================
// TEST MODAL — enviar prueba manual
// ============================================
function TestModal({ mode, onClose, onSent }: { mode: "dry_run" | "live"; onClose: () => void; onSent: () => void }) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [forceDryRun, setForceDryRun] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; outboxId?: string } | null>(null);

  // Cargar catalogo de templates
  useEffect(() => {
    fetch("/api/cobranzas/wa-test", { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        const tpls = json.templates || json.data?.templates || [];
        setTemplates(tpls);
        if (tpls.length > 0) {
          setSelectedKey(tpls[0].key);
          setParams(tpls[0].sample_params);
        }
      })
      .catch(err => console.error("[TestModal] cargar templates:", err));
  }, []);

  const selectedTemplate = templates.find(t => t.key === selectedKey);

  const handleTemplateChange = (key: string) => {
    setSelectedKey(key);
    const tpl = templates.find(t => t.key === key);
    if (tpl) setParams({ ...tpl.sample_params });
    setResult(null);
  };

  const handleSend = async () => {
    if (!phone) {
      setResult({ ok: false, message: "Falta el teléfono destino" });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/cobranzas/wa-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: selectedKey,
          params,
          phone,
          customerName: customerName || "Test",
          forceDryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al enviar");
      const r = json.data?.result || json.result;
      setResult({
        ok: r?.ok ?? false,
        message: r?.dryRun
          ? `OK — registrado en outbox como dry-run (id: ${r.outboxId})`
          : r?.status === "sent"
            ? `Enviado a Meta — message_id: ${r.metaMessageId}`
            : `Status: ${r?.status} — ${r?.error || ""}`,
        outboxId: r?.outboxId,
      });
      // Refresh la lista
      setTimeout(onSent, 1500);
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Error desconocido" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">Enviar prueba de WhatsApp</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* Modo global */}
          <div className={`rounded-lg p-2 border ${mode === "live" ? "border-red-500/30 bg-red-500/5" : "border-violet-500/30 bg-violet-500/5"}`}>
            <p className={mode === "live" ? "text-red-400" : "text-violet-400"}>
              <strong>Modo global actual:</strong> {mode === "live" ? "LIVE (envía real)" : "DRY-RUN (no envía)"}
            </p>
          </div>

          {/* Template selector */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Template</label>
            <select
              value={selectedKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
            >
              {templates.map(t => (
                <option key={t.key} value={t.key}>{t.name} — {t.description.slice(0, 50)}</option>
              ))}
            </select>
          </div>

          {/* Body preview */}
          {selectedTemplate && (
            <div>
              <p className="text-gray-500 mb-1">Body (con placeholders)</p>
              <div className="rounded-lg p-2 bg-wuipi-bg border border-wuipi-border text-gray-300 text-[11px]">
                {selectedTemplate.body}
              </div>
            </div>
          )}

          {/* Phone */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Teléfono destino *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="04141234567 o 584141234567"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nombre cliente</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Test"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Variables */}
          {selectedTemplate && selectedTemplate.variable_keys.length > 0 && (
            <div>
              <p className="text-gray-500 mb-1">Variables del template</p>
              <div className="space-y-2">
                {selectedTemplate.variable_keys.map(k => (
                  <div key={k}>
                    <label className="text-[10px] text-gray-600 mb-0.5 block">{`{{${k}}}`}</label>
                    <input
                      value={params[k] || ""}
                      onChange={(e) => setParams(p => ({ ...p, [k]: e.target.value }))}
                      placeholder={selectedTemplate.sample_params[k] || ""}
                      className="w-full px-3 py-1.5 rounded-lg bg-wuipi-bg border border-wuipi-border text-xs text-white placeholder-gray-700 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Force dry-run toggle */}
          <div className="flex items-center gap-2 p-2 rounded-lg border border-wuipi-border">
            <input
              type="checkbox"
              id="dryRun"
              checked={forceDryRun}
              onChange={(e) => setForceDryRun(e.target.checked)}
              className="cursor-pointer"
            />
            <label htmlFor="dryRun" className="text-xs text-gray-300 cursor-pointer flex-1">
              <span className="font-semibold">Forzar dry-run</span>
              <span className="text-gray-500 ml-2">
                {forceDryRun
                  ? "Solo registra en outbox, NO envía a Meta (recomendado para pruebas)"
                  : "⚠️ El mensaje SÍ se enviará a Meta si el modo global lo permite (requiere super_admin)"}
              </span>
            </label>
          </div>

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg p-3 border ${result.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-red-500/30 bg-red-500/5 text-red-400"}`}>
              <p className="font-semibold">{result.ok ? "Éxito" : "Error"}</p>
              <p className="mt-1">{result.message}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-wuipi-card border-t border-wuipi-border p-4 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white"
          >
            Cerrar
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !selectedKey || !phone}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
              forceDryRun ? "bg-violet-500 hover:bg-violet-500/90" : "bg-red-500 hover:bg-red-500/90"
            }`}
          >
            <Send size={14} />
            {sending ? "Enviando..." : forceDryRun ? "Enviar (dry-run)" : "Enviar REAL ⚠️"}
          </button>
        </div>
      </div>
    </div>
  );
}
