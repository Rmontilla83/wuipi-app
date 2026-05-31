"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Copy,
  Check,
  CircleDot,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCaracas, formatRelative } from "@/lib/cobranzas/period-helpers";
import type { TxDetail, TxStatus } from "@/lib/cobranzas/types";

type Tab = "general" | "pasarela" | "sync" | "diagnostico";

const fmtUsd = new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const fmtBs = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 });

const STATUS_PILL: Record<TxStatus, { label: string; cls: string }> = {
  paid: { label: "Pagado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  failed: { label: "Fallido", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  pending: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  viewed: { label: "Visto", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  sent: { label: "Enviado", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  expired: { label: "Expirado", cls: "bg-gray-500/15 text-gray-300 border-gray-500/30" },
  conciliating: { label: "Conciliando", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
};

/**
 * El estado de Wuipi es "tiempo desde la última actividad relevante":
 *  - paid → tiempo desde paid_at
 *  - resto → tiempo desde created_at (no hay timestamp por transición de estado)
 */
function referenceTimeForStatus(item: TxDetail["item"]): string {
  if (item.status === "paid" && item.paid_at) return item.paid_at;
  return item.created_at;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-white"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copiado" : "Copiar"}
    </button>
  );
}

function ToneIcon({ tone }: { tone: TxDetail["timeline"][number]["tone"] }) {
  const map = {
    ok: { Icon: CheckCircle2, cls: "text-emerald-400" },
    fail: { Icon: XCircle, cls: "text-rose-400" },
    warn: { Icon: AlertTriangle, cls: "text-amber-400" },
    info: { Icon: CircleDot, cls: "text-cyan-400" },
  } as const;
  const { Icon, cls } = map[tone];
  return <Icon size={14} className={cls} />;
}

function JsonViewer({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  if (data == null) return <span className="text-xs text-gray-600">sin payload</span>;
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="bg-wuipi-bg border border-wuipi-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 bg-wuipi-bg/50">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {open ? "Ocultar" : "Ver"} JSON
        </button>
        <CopyButton text={json} />
      </div>
      {open && (
        <pre className="px-3 py-2 text-[11px] text-gray-300 font-mono whitespace-pre-wrap max-h-72 overflow-auto">
          {json}
        </pre>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
      <p className={cn("text-sm text-white break-words", mono && "font-mono")}>{value || <span className="text-gray-600">—</span>}</p>
    </div>
  );
}

export function DetailDrawer({ txId, onClose }: { txId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("general");

  useEffect(() => {
    setTab("general");
  }, [txId]);

  useEffect(() => {
    if (!txId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [txId, onClose]);

  const { data, isLoading, isError } = useQuery<TxDetail>({
    queryKey: ["cobranzas-tx-detail", txId],
    queryFn: async () => {
      if (!txId) throw new Error("no id");
      const res = await fetch(`/api/cobranzas/panel/transactions/${txId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!txId,
    staleTime: 30 * 1000,
  });

  const open = !!txId;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed top-0 right-0 h-full w-full sm:w-[520px] lg:w-[600px] bg-wuipi-card border-l border-wuipi-border z-50 transition-transform duration-200 flex flex-col",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 bg-wuipi-card border-b border-wuipi-border px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Detalle de transacción</p>
            <p className="text-sm font-mono text-white truncate">{txId || ""}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-wuipi-card-hover"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <Loader2 size={24} className="animate-spin text-wuipi-accent mr-2" />
            Cargando…
          </div>
        )}

        {isError && (
          <div className="flex-1 p-6">
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-400">
              No se pudo cargar el detalle. Reintenta cerrando y abriendo el panel.
            </div>
          </div>
        )}

        {data && !isLoading && (
          <>
            <div className="px-4 pt-4 pb-3 border-b border-wuipi-border space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-white truncate">{data.item.customer_name}</h2>
                <span className="text-lg font-bold text-white whitespace-nowrap">
                  {fmtUsd.format(data.item.amount_usd)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-mono">{data.item.customer_cedula_rif}</span>
                {data.item.amount_bss && data.item.amount_bss > 0 && (
                  <>
                    <span>·</span>
                    <span>Bs. {fmtBs.format(data.item.amount_bss)}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span
                  className={cn(
                    "inline-flex items-center text-xs px-2 py-1 rounded-md border",
                    STATUS_PILL[data.item.status]?.cls || "bg-gray-500/10 text-gray-400 border-gray-500/20",
                  )}
                >
                  {STATUS_PILL[data.item.status]?.label || data.item.status}
                </span>
                <span className="text-xs text-gray-500">
                  {data.item.status === "paid" ? "pagado " : "en este estado "}
                  {formatRelative(referenceTimeForStatus(data.item))}
                </span>
              </div>
            </div>

            <div className="flex border-b border-wuipi-border bg-wuipi-bg/30 px-2 overflow-x-auto">
              {(["general", "pasarela", "sync", "diagnostico"] as Tab[]).map((t) => {
                const labels: Record<Tab, string> = {
                  general: "General",
                  pasarela: "Pasarela",
                  sync: "Sync Odoo",
                  diagnostico: "Diagnóstico",
                };
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap",
                      tab === t
                        ? "border-wuipi-accent text-white"
                        : "border-transparent text-gray-500 hover:text-white",
                    )}
                  >
                    {labels[t]}
                    {t === "pasarela" && data.gatewayEvents.length > 0 && (
                      <span className="ml-1.5 text-xs text-gray-600">({data.gatewayEvents.length})</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {tab === "general" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Estado" value={data.item.status} />
                    <Field label="Método" value={data.item.payment_method} />
                    <Field label="Creado" value={formatCaracas(data.item.created_at)} mono />
                    <Field label="Pagado" value={formatCaracas(data.item.paid_at)} mono />
                    <Field label="Factura" value={data.item.invoice_number} mono />
                    <Field label="Ref. banco" value={data.item.payment_reference} mono />
                    <Field label="Email" value={data.item.customer_email} />
                    <Field label="Teléfono" value={data.item.customer_phone} />
                  </div>

                  {data.item.concept && (
                    <Field label="Concepto" value={data.item.concept} />
                  )}

                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Línea de tiempo</p>
                    <ol className="relative ml-2 space-y-3 border-l border-wuipi-border pl-4">
                      {data.timeline.map((e, i) => (
                        <li key={i} className="relative">
                          <span className="absolute -left-[22px] top-0.5 bg-wuipi-card rounded-full p-0.5 border border-wuipi-border">
                            <ToneIcon tone={e.tone} />
                          </span>
                          <p className="text-sm text-white leading-tight">{e.label}</p>
                          <p className="text-xs text-gray-500 font-mono">{formatCaracas(e.at)}</p>
                          {e.detail && <p className="text-xs text-gray-400 mt-0.5">{e.detail}</p>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}

              {tab === "pasarela" && (
                <div className="space-y-3">
                  {data.gatewayEvents.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No hay eventos registrados de pasarela para esta transacción.
                    </p>
                  )}
                  {data.gatewayEvents.map((ev) => (
                    <div key={ev.id} className="border border-wuipi-border rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-white">
                            <span className="font-semibold capitalize">{ev.gateway}</span>
                            {ev.gateway_product && (
                              <span className="text-gray-500"> · {ev.gateway_product}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">{formatCaracas(ev.created_at)}</p>
                        </div>
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-md",
                            ev.outcome === "success" && "bg-emerald-500/10 text-emerald-400",
                            ev.outcome === "error" && "bg-rose-500/10 text-rose-400",
                            ev.outcome === "pending" && "bg-amber-500/10 text-amber-400",
                            !ev.outcome && "bg-gray-500/10 text-gray-400",
                          )}
                        >
                          {ev.event_type}
                        </span>
                      </div>
                      {(ev.response_code || ev.response_message) && (
                        <div className="text-xs text-gray-400">
                          {ev.response_code && <span className="font-mono mr-2">[{ev.response_code}]</span>}
                          {ev.response_message}
                        </div>
                      )}
                      {ev.duration_ms != null && (
                        <p className="text-xs text-gray-600">⏱ {ev.duration_ms}ms</p>
                      )}
                      {(ev.request_payload != null || ev.response_payload != null) && (
                        <div className="space-y-2 pt-1">
                          {ev.request_payload != null && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Request</p>
                              <JsonViewer data={ev.request_payload} />
                            </div>
                          )}
                          {ev.response_payload != null && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Response</p>
                              <JsonViewer data={ev.response_payload} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {data.webhookEvents.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 mt-4">
                        Webhooks recibidos ({data.webhookEvents.length})
                      </p>
                      <div className="space-y-2">
                        {data.webhookEvents.map((w) => (
                          <div key={w.id} className="border border-wuipi-border rounded-xl p-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono text-gray-400">{formatCaracas(w.received_at)}</span>
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-md",
                                  w.processed ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400",
                                )}
                              >
                                {w.processed ? "Procesado" : "No procesado"}
                              </span>
                            </div>
                            {w.processing_error && (
                              <p className="text-xs text-rose-400">{w.processing_error}</p>
                            )}
                            <JsonViewer data={w.raw_payload} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "sync" && (
                <div className="space-y-3">
                  {!data.syncQueue && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400">
                      Esta transacción no tiene entrada en la cola de sync Odoo. Posibles causas:
                      <ul className="list-disc list-inside text-amber-300/80 text-xs mt-2 space-y-1">
                        <li>El pago se cobró pero el código no encoló el sync.</li>
                        <li>Quedó como huérfano de la cola — requiere conciliación manual.</li>
                      </ul>
                    </div>
                  )}
                  {data.syncQueue && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Estado" value={data.syncQueue.status} />
                      <Field label="Intentos" value={String(data.syncQueue.attempts)} />
                      <Field label="Factura Odoo ID" value={data.syncQueue.odoo_invoice_id} mono />
                      <Field
                        label="Próximo intento"
                        value={formatCaracas(data.syncQueue.next_attempt_at)}
                        mono
                      />
                      <Field
                        label="Último intento"
                        value={formatCaracas(data.syncQueue.last_attempt_at)}
                        mono
                      />
                      <Field
                        label="Resuelto manual"
                        value={data.syncQueue.resolved_manually ? "Sí" : "No"}
                      />
                      <div className="col-span-2">
                        <Field
                          label="post_invoice / register_payment"
                          value={`${data.syncQueue.post_invoice_done ? "✓" : "✗"} post · ${data.syncQueue.register_payment_done ? "✓" : "✗"} payment`}
                        />
                      </div>
                      {data.syncQueue.last_error && (
                        <div className="col-span-2">
                          <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Último error</p>
                          <pre className="text-xs text-rose-300 bg-rose-500/5 border border-rose-500/20 rounded-lg p-2.5 whitespace-pre-wrap">
                            {data.syncQueue.last_error}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {data.item.odoo_invoice_ids.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Facturas Odoo asociadas</p>
                      <div className="space-y-1">
                        {data.item.odoo_invoices_meta.length > 0
                          ? data.item.odoo_invoices_meta.map((inv) => (
                              <div
                                key={inv.id}
                                className="flex items-center justify-between text-xs bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2"
                              >
                                <span className="text-white font-mono">{inv.number || `id:${inv.id}`}</span>
                                <span className="text-gray-500 font-mono">#{inv.id}</span>
                              </div>
                            ))
                          : data.item.odoo_invoice_ids.map((id) => (
                              <div
                                key={id}
                                className="text-xs bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 font-mono text-white"
                              >
                                id:{id}
                              </div>
                            ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "diagnostico" && (
                <>
                  {data.diagnostic ? (
                    <div
                      className={cn(
                        "rounded-xl p-4 border space-y-3",
                        data.diagnostic.severity === "error" && "bg-rose-500/5 border-rose-500/30",
                        data.diagnostic.severity === "warn" && "bg-amber-500/5 border-amber-500/30",
                        data.diagnostic.severity === "info" && "bg-cyan-500/5 border-cyan-500/30",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "rounded-lg p-2 shrink-0",
                            data.diagnostic.severity === "error" && "bg-rose-500/10 text-rose-400",
                            data.diagnostic.severity === "warn" && "bg-amber-500/10 text-amber-400",
                            data.diagnostic.severity === "info" && "bg-cyan-500/10 text-cyan-400",
                          )}
                        >
                          {data.diagnostic.severity === "error" ? (
                            <XCircle size={20} />
                          ) : data.diagnostic.severity === "warn" ? (
                            <AlertTriangle size={20} />
                          ) : (
                            <Info size={20} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
                            Qué pasó
                          </p>
                          <p className="text-sm text-white">{data.diagnostic.reason}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
                          Cómo actuar
                        </p>
                        <p className="text-sm text-gray-200">{data.diagnostic.action}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 size={18} />
                        <p className="text-sm">
                          Transacción sin incidencias detectadas — flujo completo sin errores.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
