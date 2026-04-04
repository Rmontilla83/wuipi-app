"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft, RefreshCw, Mail, Phone, MapPin, Building2,
  CreditCard, FileText, Receipt, Clock, Tag, Globe,
  AlertTriangle, CheckCircle2, Pause, Ban, Eye,
} from "lucide-react";
import type { OdooClientDetail, OdooSubscription, OdooInvoiceDetail, OdooPayment, MikrotikService } from "@/types/odoo";

type Tab = "suscripciones" | "red" | "facturacion" | "informacion" | "soporte";

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBs = (n: number) => `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtAmount = (n: number, currency: string) => currency === "USD" ? fmtUSD(n) : fmtBs(n);

function SubStateBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    "3_progress": { label: "Activa", color: "text-emerald-400 bg-emerald-400/10" },
    "4_paused": { label: "Pausada", color: "text-amber-400 bg-amber-400/10" },
  };
  const c = cfg[state] || { label: state, color: "text-gray-400 bg-gray-400/10" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

function PaymentStateBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    paid: { label: "Pagado", color: "text-emerald-400 bg-emerald-400/10" },
    in_payment: { label: "En pago", color: "text-blue-400 bg-blue-400/10" },
    not_paid: { label: "Pendiente", color: "text-red-400 bg-red-400/10" },
    partial: { label: "Parcial", color: "text-amber-400 bg-amber-400/10" },
    reversed: { label: "Reversado", color: "text-gray-400 bg-gray-400/10" },
  };
  const c = cfg[state] || { label: state, color: "text-gray-400 bg-gray-400/10" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === "0" || value === "false") return null;
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-wuipi-border/30 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs text-white ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partnerId = params.id as string;

  const [data, setData] = useState<OdooClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("suscripciones");

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/odoo/clients/${partnerId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar cliente");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <>
        <TopBar title="Cliente" />
        <div className="flex items-center justify-center py-24">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
          <span className="ml-3 text-gray-500 text-sm">Cargando perfil desde Odoo...</span>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <TopBar title="Cliente" />
        <div className="p-6">
          <Card className="!p-8 text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
            <p className="text-red-400 text-sm">{error || "Cliente no encontrado"}</p>
            <button onClick={() => router.push("/clientes")} className="mt-4 text-xs text-gray-400 hover:text-white underline">
              Volver a clientes
            </button>
          </Card>
        </div>
      </>
    );
  }

  const totalMRR = data.subscriptions.filter(s => s.state === "3_progress").reduce((s, sub) => s + sub.recurring_monthly, 0);
  const totalServices = data.subscriptions.reduce((s, sub) => s + sub.lines.length, 0);
  const svcActive = data.subscriptions.reduce((s, sub) => s + sub.lines.filter(l => l.service_state === "progress").length, 0);
  const svcSuspended = data.subscriptions.reduce((s, sub) => s + sub.lines.filter(l => l.service_state === "suspended").length, 0);
  const statusLabel = totalServices === 0 ? "Sin servicio" : svcSuspended === 0 ? `${svcActive} activo${svcActive !== 1 ? "s" : ""}` : svcActive === 0 ? `${svcSuspended} suspendido${svcSuspended !== 1 ? "s" : ""}` : `${svcActive} activo${svcActive !== 1 ? "s" : ""} / ${svcSuspended} susp.`;
  const statusColor = totalServices === 0 ? "text-gray-400" : svcSuspended === 0 ? "text-emerald-400" : svcActive === 0 ? "text-red-400" : "text-amber-400";

  const tabs: { id: Tab; label: string }[] = [
    { id: "suscripciones", label: `Servicios (${data.subscriptions.reduce((s, sub) => s + sub.lines.length, 0)})` },
    { id: "red", label: "Red" },
    { id: "facturacion", label: `Facturación (${data.invoices.length})` },
    { id: "informacion", label: "Información" },
    { id: "soporte", label: "Soporte" },
  ];

  return (
    <>
      <TopBar title={data.name} />
      <div className="p-4 md:p-6 space-y-4">

        {/* Back + Header */}
        <div className="flex items-start gap-4">
          <button onClick={() => router.push("/clientes")} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white mt-1">
            <ChevronLeft size={16} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">{data.name}</h2>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor} ${statusColor.replace("text-", "bg-")}/10`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {data.identification_type} {data.vat}
              {data.responsibility_type && <> — {data.responsibility_type}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/portal/preview/${data.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs font-medium hover:bg-violet-500/20 transition-colors"
            >
              <Eye size={14} /> Ver portal
            </a>
            <button
              onClick={() => {
                fetch(`/api/portal/payment-link?partnerId=${data.id}`)
                  .then(r => r.json())
                  .then(d => { if (d.url) { navigator.clipboard.writeText(d.url); alert("Link copiado: " + d.url); } });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
            >
              <CreditCard size={14} /> Link de pago
            </button>
            <button onClick={fetchDetail} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="!p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">MRR</p>
            <p className="text-lg font-bold text-cyan-400">{fmtUSD(totalMRR)}</p>
          </Card>
          <Card className="!p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Servicios</p>
            <p className="text-lg font-bold text-white">{totalServices}</p>
          </Card>
          <Card className="!p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Por cobrar</p>
            <p className={`text-lg font-bold ${data.total_due > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {fmtUSD(data.total_due)}
            </p>
          </Card>
          <Card className="!p-3 text-center">
            <p className="text-[10px] text-gray-500 uppercase">Suscripciones</p>
            <p className="text-lg font-bold text-white">{data.subscription_count}</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-wuipi-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-wuipi-accent text-wuipi-accent"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "suscripciones" && <SubscripcionesTab subscriptions={data.subscriptions} />}
        {tab === "red" && <RedTab partnerId={data.id} />}
        {tab === "facturacion" && <FacturacionTab data={data} />}
        {tab === "informacion" && <InformacionTab data={data} />}
        {tab === "soporte" && <SoporteTab vat={data.vat} name={data.name} />}
      </div>
    </>
  );
}

// ── Tab: Suscripciones ──────────────────────────────────

function SubscripcionesTab({ subscriptions }: { subscriptions: OdooSubscription[] }) {
  if (subscriptions.length === 0) {
    return (
      <Card className="text-center py-12">
        <Ban size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-400 text-sm">No tiene suscripciones</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {subscriptions.map((sub) => (
        <Card key={sub.id} className="!p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-white font-mono text-sm font-bold">{sub.name}</span>
              <SubStateBadge state={sub.state} />
            </div>
            <div className="text-right">
              <p className="text-cyan-400 font-bold text-sm">{fmtUSD(sub.recurring_monthly)}<span className="text-gray-500 font-normal text-xs">/mes</span></p>
              <p className="text-[10px] text-gray-500">{sub.currency}</p>
            </div>
          </div>

          {/* Lines */}
          <div className="bg-wuipi-bg rounded-lg border border-wuipi-border overflow-auto max-h-[320px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-wuipi-border">
                  <th className="text-left p-2 font-medium">Producto/Plan</th>
                  <th className="text-left p-2 font-medium">Código</th>
                  <th className="text-right p-2 font-medium">Precio</th>
                  <th className="text-right p-2 font-medium">Cant.</th>
                  <th className="text-right p-2 font-medium">Subtotal</th>
                  <th className="text-center p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sub.lines.map((line, i) => (
                  <tr key={i} className={`border-b border-wuipi-border/30 last:border-0 ${line.service_state === "suspended" ? "opacity-60" : ""}`}>
                    <td className="p-2 text-white">{line.product_name}</td>
                    <td className="p-2 text-gray-500 font-mono">{line.product_code}</td>
                    <td className="p-2 text-right text-gray-300">{fmtUSD(line.price_unit)}</td>
                    <td className="p-2 text-right text-gray-400">{line.quantity}</td>
                    <td className="p-2 text-right text-emerald-400 font-medium">{fmtUSD(line.price_subtotal)}</td>
                    <td className="p-2 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                        line.service_state === "progress" ? "text-emerald-400 bg-emerald-400/10" :
                        line.service_state === "suspended" ? "text-red-400 bg-red-400/10" :
                        "text-gray-400 bg-gray-400/10"
                      }`}>
                        {line.service_state === "progress" ? "Activo" : line.service_state === "suspended" ? "Suspendido" : line.service_state || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
            <span>Inicio: {sub.start_date || "—"}</span>
            <span>Próxima factura: {sub.next_invoice_date || "—"}</span>
            <span>Total con IVA: {fmtUSD(sub.amount_total)}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Tab: Facturación ────────────────────────────────────

function FacturacionTab({ data }: { data: OdooClientDetail }) {
  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-[10px] text-gray-500">Total facturado</p>
          <p className="text-sm font-bold text-white">{fmtBs(data.total_invoiced)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-[10px] text-gray-500">Por cobrar</p>
          <p className={`text-sm font-bold ${data.total_due > 0 ? "text-amber-400" : "text-emerald-400"}`}>{fmtUSD(data.total_due)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-[10px] text-gray-500">Vencido</p>
          <p className="text-sm font-bold text-orange-400">{fmtBs(data.total_overdue)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-[10px] text-gray-500">DSO</p>
          <p className="text-sm font-bold text-amber-400">{data.days_sales_outstanding} días</p>
        </Card>
      </div>

      {/* Invoices */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <FileText size={14} /> Facturas recientes
        </h3>
        {data.invoices.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-6">Sin facturas</p>
        ) : (
          <div className="overflow-auto max-h-[300px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-wuipi-card">
                <tr className="text-gray-500 border-b border-wuipi-border">
                  <th className="text-left p-2 font-medium">Factura</th>
                  <th className="text-left p-2 font-medium">Fecha</th>
                  <th className="text-left p-2 font-medium">Vencimiento</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-right p-2 font-medium">Pendiente</th>
                  <th className="text-center p-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-wuipi-border/30">
                    <td className="p-2 text-white font-mono">{inv.invoice_number}</td>
                    <td className="p-2 text-gray-400">{inv.invoice_date}</td>
                    <td className="p-2 text-gray-400">{inv.due_date}</td>
                    <td className="p-2 text-right text-gray-300">{fmtAmount(inv.total, inv.currency)}</td>
                    <td className="p-2 text-right font-medium">
                      {inv.amount_due > 0 ? (
                        <span className="text-red-400">{fmtAmount(inv.amount_due, inv.currency)}</span>
                      ) : (
                        <span className="text-emerald-400">0.00</span>
                      )}
                    </td>
                    <td className="p-2 text-center"><PaymentStateBadge state={inv.payment_state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payments */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Receipt size={14} /> Pagos recientes
        </h3>
        {data.payments.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-6">Sin pagos registrados</p>
        ) : (
          <div className="overflow-auto max-h-[250px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-wuipi-card">
                <tr className="text-gray-500 border-b border-wuipi-border">
                  <th className="text-left p-2 font-medium">Fecha</th>
                  <th className="text-right p-2 font-medium">Monto</th>
                  <th className="text-left p-2 font-medium">Moneda</th>
                  <th className="text-left p-2 font-medium">Banco/Método</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((pay) => (
                  <tr key={pay.id} className="border-b border-wuipi-border/30">
                    <td className="p-2 text-gray-400">{pay.date}</td>
                    <td className="p-2 text-right text-emerald-400 font-medium">{fmtAmount(pay.amount, pay.currency)}</td>
                    <td className="p-2 text-gray-400">{pay.currency}</td>
                    <td className="p-2 text-gray-300">{pay.journal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Información ────────────────────────────────────

function InformacionTab({ data }: { data: OdooClientDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Datos fiscales */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Building2 size={14} /> Datos Fiscales
        </h3>
        <div className="space-y-0">
          <InfoRow label="RIF/Cédula" value={`${data.identification_type} ${data.vat}`} mono />
          <InfoRow label="Tipo" value={data.is_company ? "Persona Jurídica" : "Persona Natural"} />
          <InfoRow label="Responsabilidad SENIAT" value={data.responsibility_type} />
          <InfoRow label="Lista de precios" value={data.pricelist} />
          <InfoRow label="Referencia" value={data.ref} mono />
          <InfoRow label="Cargo" value={data.function} />
        </div>
      </Card>

      {/* Dirección */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <MapPin size={14} /> Dirección
        </h3>
        <div className="space-y-0">
          <InfoRow label="Calle" value={data.street} />
          {data.street2 && data.street2 !== "0" && <InfoRow label="Calle 2" value={data.street2} />}
          <InfoRow label="Ciudad" value={data.city} />
          <InfoRow label="Estado" value={data.state} />
          <InfoRow label="Municipio" value={data.municipality} />
          <InfoRow label="Parroquia" value={data.parish} />
          <InfoRow label="ZIP" value={data.zip} mono />
          <InfoRow label="País" value={data.country} />
          {(data.latitude !== 0 || data.longitude !== 0) && (
            <InfoRow label="Coordenadas" value={`${data.latitude}, ${data.longitude}`} mono />
          )}
        </div>
      </Card>

      {/* Contacto */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Phone size={14} /> Contacto
        </h3>
        <div className="space-y-0">
          <InfoRow label="Email" value={data.email} />
          <InfoRow label="Celular" value={data.mobile} />
          <InfoRow label="Teléfono" value={data.phone} />
        </div>
      </Card>

      {/* Cobranza y seguimiento */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <CreditCard size={14} /> Seguimiento
        </h3>
        <div className="space-y-0">
          <InfoRow label="Nivel de confianza" value={data.trust === "normal" ? "Normal" : data.trust === "good" ? "Bueno" : data.trust} />
          <InfoRow label="Estado de seguimiento" value={data.followup_status === "no_action_needed" ? "Sin acción requerida" : data.followup_status} />
          <InfoRow label="Suspender" value={data.suspend ? "Sí" : "No"} />
          <InfoRow label="No suspender" value={data.not_suspend ? "Sí (protegido)" : "No"} />
          <InfoRow label="DSO" value={`${data.days_sales_outstanding} días`} />
        </div>
      </Card>

      {/* Tags y notas */}
      {(data.tags.length > 0 || data.notes) && (
        <Card className="md:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Tag size={14} /> Tags y Notas
          </h3>
          {data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {data.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full text-[10px] bg-wuipi-accent/10 text-wuipi-accent border border-wuipi-accent/20">{t}</span>
              ))}
            </div>
          )}
          {data.notes && (
            <div className="text-xs text-gray-400 bg-wuipi-bg rounded-lg p-3 border border-wuipi-border" dangerouslySetInnerHTML={{ __html: data.notes }} />
          )}
        </Card>
      )}
    </div>
  );
}

// ── Tab: Red ──────────────────────────────────────────

function RedTab({ partnerId }: { partnerId: number }) {
  const [services, setServices] = useState<MikrotikService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/odoo/clients/${partnerId}/network`);
        if (res.ok) {
          const data = await res.json();
          setServices(data.services || []);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [partnerId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <Card className="text-center py-12">
        <AlertTriangle size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-400 text-sm">No se encontraron servicios de red para este cliente</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {services.map((svc) => {
        const stateMap: Record<string, { label: string; color: string }> = {
          progress: { label: "Activo", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
          suspended: { label: "Suspendido", color: "text-red-400 bg-red-400/10 border-red-400/20" },
          closed: { label: "Cerrado", color: "text-gray-400 bg-gray-400/10 border-gray-400/20" },
        };
        const st = stateMap[svc.state] || stateMap.closed;

        return (
          <Card key={svc.id} className="!p-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-wuipi-border bg-wuipi-card/50">
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold text-sm">{svc.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${st.color}`}>{st.label}</span>
                {svc.mikrotik_activated && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium text-blue-400 bg-blue-400/10">MK Activo</span>
                )}
              </div>
              <span className="text-xs text-gray-500">{svc.product_name.replace(/\[.*?\]\s*/, "")}</span>
            </div>

            {/* Body */}
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5">
              <InfoRow label="Nodo" value={svc.node_name} />
              <InfoRow label="Router" value={svc.router_name} />
              <InfoRow label="Sector" value={svc.monitoring_sector} />
              <InfoRow label="Categoría" value={svc.category} />
              <InfoRow label="IP CPE" value={svc.ip_cpe} mono />
              <InfoRow label="IP Red" value={svc.ipv4} mono />
              <InfoRow label="Dirección instalación" value={svc.address} />
              <InfoRow label="Suscripción" value={svc.subscription_ref} />
              <InfoRow label="Fecha instalación" value={svc.install_date} />
              <InfoRow label="Fecha suspensión" value={svc.suspend_date} />
              <InfoRow label="Teléfono" value={svc.mobile || svc.phone} />
              <InfoRow label="Promesa de pago" value={svc.payment_promise_date} />
            </div>

            {/* Flags */}
            {(svc.to_suspend || svc.to_change_plan) && (
              <div className="px-5 py-2 border-t border-wuipi-border/30 flex gap-3">
                {svc.to_suspend && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <Ban size={12} /> Pendiente suspensión
                  </span>
                )}
                {svc.to_change_plan && (
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <RefreshCw size={12} /> Cambio de plan pendiente
                  </span>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Tab: Soporte ────────────────────────────────────────

function SoporteTab({ vat, name }: { vat: string; name: string }) {
  return (
    <Card className="text-center py-12">
      <Globe size={32} className="mx-auto mb-3 text-gray-600" />
      <p className="text-gray-400 text-sm mb-2">Tickets de soporte para {name}</p>
      <p className="text-gray-600 text-xs">
        Los tickets se vincularán automáticamente por cédula/RIF ({vat}) en futuras versiones.
      </p>
    </Card>
  );
}
