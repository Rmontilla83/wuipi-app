"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft, Users, Wifi, WifiOff, Power, Edit2,
  FileText, CreditCard, Headphones, Radio, Package,
  Phone, Mail, MapPin, Calendar, DollarSign,
  Clock, AlertTriangle, CheckCircle,
  RefreshCw, Receipt,
  User, Hash, Globe, Zap,
} from "lucide-react";

/* ========== TYPES ========== */
interface Plan {
  id: string; code: string; name: string; price_usd: number;
  speed_down: number; speed_up: number; technology: string;
}
interface Invoice {
  id: string; invoice_number: string; issue_date: string; due_date: string;
  currency: string; total: number; amount_paid: number; balance_due: number; status: string;
}
interface Payment {
  id: string; payment_number: string; payment_date: string; amount: number;
  currency: string; status: string; reference_number: string;
  payment_methods?: { name: string } | null;
}
interface BillingSummary {
  total_invoiced: number; total_paid: number; total_overdue: number;
  balance: number; invoice_count: number; payment_count: number;
}
interface ClientDetail {
  id: string; code: string; legal_name: string; trade_name: string;
  document_type: string; document_number: string;
  email: string; phone: string; phone_alt: string; contact_person: string;
  address: string; city: string; state: string; sector: string; nodo: string;
  plan_id: string | null; service_status: string; installation_date: string | null;
  billing_currency: string; billing_day: number; credit_balance: number;
  notes: string; kommo_contact_id: number | null;
  created_at: string; updated_at: string;
  plans?: Plan | null;
  invoices: Invoice[];
  payments: Payment[];
  billing_summary: BillingSummary;
}

type Tab = "info" | "facturacion" | "soporte" | "red" | "equipos";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "info", label: "Información", icon: User },
  { id: "facturacion", label: "Facturación", icon: CreditCard },
  { id: "soporte", label: "Soporte", icon: Headphones },
  { id: "red", label: "Red", icon: Radio },
  { id: "equipos", label: "Equipos", icon: Package },
];

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: typeof Wifi; bar: string }> = {
  active:    { label: "Activo",     color: "text-emerald-400", bg: "bg-emerald-400/10", icon: Wifi,          bar: "#34d399" },
  suspended: { label: "Suspendido", color: "text-red-400",     bg: "bg-red-400/10",     icon: WifiOff,       bar: "#f87171" },
  pending:   { label: "Pendiente",  color: "text-amber-400",   bg: "bg-amber-400/10",   icon: Clock,         bar: "#fbbf24" },
  cancelled: { label: "Cancelado",  color: "text-gray-500",    bg: "bg-gray-500/10",    icon: AlertTriangle, bar: "#6b7280" },
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Borrador",  cls: "text-gray-400 bg-gray-400/10" },
  sent:      { label: "Enviada",   cls: "text-blue-400 bg-blue-400/10" },
  paid:      { label: "Pagada",    cls: "text-emerald-400 bg-emerald-400/10" },
  partial:   { label: "Parcial",   cls: "text-amber-400 bg-amber-400/10" },
  overdue:   { label: "Vencida",   cls: "text-red-400 bg-red-400/10" },
  cancelled: { label: "Anulada",   cls: "text-gray-500 bg-gray-500/10" },
};

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmado", cls: "text-emerald-400 bg-emerald-400/10" },
  pending:   { label: "Pendiente",  cls: "text-amber-400 bg-amber-400/10" },
  rejected:  { label: "Rechazado",  cls: "text-red-400 bg-red-400/10" },
};

/* ========== HELPERS ========== */
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-VE") : "—";

/* ========== MAIN PAGE ========== */
export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [toggling, setToggling] = useState(false);

  const fetchClient = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/facturacion/clients/${clientId}?detail=true`);
      if (!res.ok) throw new Error("Cliente no encontrado");
      const data = await res.json();
      // Ensure defaults for optional nested data
      data.invoices = data.invoices || [];
      data.payments = data.payments || [];
      data.billing_summary = data.billing_summary || {
        total_invoiced: 0, total_paid: 0, total_overdue: 0,
        balance: 0, invoice_count: 0, payment_count: 0,
      };
      setClient(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  const toggleStatus = async () => {
    if (!client || toggling) return;
    const newStatus = client.service_status === "active" ? "suspended" : "active";
    setToggling(true);
    try {
      const res = await fetch(`/api/facturacion/clients/${clientId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_status: newStatus }),
      });
      if (res.ok) fetchClient();
    } finally { setToggling(false); }
  };

  /* Loading / Error states */
  if (loading) return (
    <>
      <TopBar title="Cliente" icon={<Users size={22} />} />
      <div className="flex-1 flex items-center justify-center"><RefreshCw className="animate-spin text-gray-500" size={24} /></div>
    </>
  );

  if (error || !client) return (
    <>
      <TopBar title="Cliente" icon={<Users size={22} />} />
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <AlertTriangle size={48} className="mb-4" />
        <p className="text-lg mb-4">{error || "Cliente no encontrado"}</p>
        <button onClick={() => router.push("/clientes")} className="text-wuipi-accent hover:underline text-sm">← Volver a clientes</button>
      </div>
    </>
  );

  const st = STATUS_MAP[client.service_status] || STATUS_MAP.pending;
  const StIcon = st.icon;

  return (
    <>
      <TopBar
        title={client.legal_name}
        subtitle={client.code}
        icon={<Users size={22} />}
        actions={
          <button onClick={() => router.push("/clientes")} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white text-sm transition-colors">
            <ArrowLeft size={14} /> Volver
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* ── HEADER CARD ── */}
        <Card className="!p-0 overflow-hidden">
          <div className="h-1" style={{ background: st.bar }} />
          <div className="p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl ${st.bg} border border-white/5 flex items-center justify-center`}>
                  <StIcon size={24} className={st.color} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{client.legal_name}</h2>
                  <p className="text-gray-500 text-sm">
                    {client.code} • {client.document_type}-{client.document_number}
                    {client.trade_name && <span className="ml-2 text-gray-600">({client.trade_name})</span>}
                  </p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.color} ${st.bg}`}>
                      <StIcon size={12} /> {st.label}
                    </span>
                    {client.plans && (
                      <span className="text-xs text-gray-400 bg-wuipi-bg px-2.5 py-1 rounded-full">
                        {client.plans.name} • ${client.plans.price_usd}/mes
                      </span>
                    )}
                    <span className="text-xs text-gray-500">Cliente desde {fmtDate(client.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={toggleStatus} disabled={toggling}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                    client.service_status === "active"
                      ? "border-red-500/20 text-red-400 hover:bg-red-500/10"
                      : "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
                  }`}>
                  <Power size={14} />
                  {toggling ? "..." : client.service_status === "active" ? "Suspender" : "Activar"}
                </button>
                <button onClick={() => router.push(`/clientes?edit=${client.id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-wuipi-border text-gray-400 hover:text-white hover:bg-wuipi-card-hover transition-colors">
                  <Edit2 size={14} /> Editar
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <QStat icon={DollarSign} label="Facturado" value={`$${fmt(client.billing_summary?.total_invoiced || 0)}`} color="text-cyan-400" />
              <QStat icon={CheckCircle} label="Cobrado" value={`$${fmt(client.billing_summary?.total_paid || 0)}`} color="text-emerald-400" />
              <QStat icon={AlertTriangle} label="Vencido" value={`$${fmt(client.billing_summary?.total_overdue || 0)}`} color={(client.billing_summary?.total_overdue || 0) > 0 ? "text-red-400" : "text-gray-500"} />
              <QStat icon={Receipt} label="Balance" value={`$${fmt(client.billing_summary?.balance || 0)}`} color={(client.billing_summary?.balance || 0) > 0 ? "text-amber-400" : "text-emerald-400"} />
            </div>
          </div>
        </Card>

        {/* ── TABS ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {TABS.map(tab => {
            const active = tab.id === activeTab;
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border whitespace-nowrap ${
                  active ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20" : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
                }`}>
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB CONTENT ── */}
        {activeTab === "info" && <TabInfo client={client} />}
        {activeTab === "facturacion" && <TabFacturacion client={client} />}
        {activeTab === "soporte" && <TabSoporte />}
        {activeTab === "red" && <TabRed client={client} />}
        {activeTab === "equipos" && <TabEquipos />}
      </div>
    </>
  );
}

/* ========== QUICK STAT ========== */
function QStat({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border">
      <Icon size={16} className={color} />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

/* ========== INFO ROW ========== */
function IRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className="text-gray-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-200">{value || "—"}</p>
      </div>
    </div>
  );
}

/* ========== TAB: INFO ========== */
function TabInfo({ client }: { client: ClientDetail }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Phone size={14} /> Contacto</h3>
        <div className="space-y-3">
          <IRow icon={Mail} label="Email" value={client.email} />
          <IRow icon={Phone} label="Teléfono" value={client.phone} />
          {client.phone_alt && <IRow icon={Phone} label="Tel. Alternativo" value={client.phone_alt} />}
          {client.contact_person && <IRow icon={User} label="Persona de contacto" value={client.contact_person} />}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><MapPin size={14} /> Ubicación</h3>
        <div className="space-y-3">
          {client.address && <IRow icon={MapPin} label="Dirección" value={client.address} />}
          <IRow icon={Globe} label="Ciudad / Estado" value={`${client.city || "—"}, ${client.state || "—"}`} />
          <IRow icon={Hash} label="Sector" value={client.sector} />
          <IRow icon={Radio} label="Nodo" value={client.nodo || "Sin asignar"} />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Wifi size={14} /> Servicio</h3>
        <div className="space-y-3">
          <IRow icon={Zap} label="Plan" value={client.plans ? `${client.plans.name} (${client.plans.speed_down}/${client.plans.speed_up} Mbps)` : "Sin plan"} />
          <IRow icon={Calendar} label="Instalación" value={fmtDate(client.installation_date)} />
          <IRow icon={Hash} label="Tecnología" value={client.plans?.technology} />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><CreditCard size={14} /> Config. Facturación</h3>
        <div className="space-y-3">
          <IRow icon={DollarSign} label="Moneda" value={client.billing_currency === "USD" ? "Dólares (USD)" : "Bolívares (VES)"} />
          <IRow icon={Calendar} label="Día de facturación" value={`Día ${client.billing_day} de cada mes`} />
          <IRow icon={CreditCard} label="Saldo a favor" value={`$${Number(client.credit_balance || 0).toFixed(2)}`} />
        </div>
      </Card>

      {client.notes && (
        <Card className="md:col-span-2">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2"><FileText size={14} /> Notas</h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{client.notes}</p>
        </Card>
      )}
    </div>
  );
}

/* ========== TAB: FACTURACION ========== */
function TabFacturacion({ client }: { client: ClientDetail }) {
  const bs = client.billing_summary || { total_invoiced: 0, total_paid: 0, total_overdue: 0, balance: 0, invoice_count: 0, payment_count: 0 };
  const collRate = bs.total_invoiced > 0 ? ((bs.total_paid / bs.total_invoiced) * 100) : 0;
  const invoices = client.invoices || [];
  const payments = client.payments || [];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Facturas</p>
          <p className="text-2xl font-bold text-white">{bs.invoice_count}</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Pagos</p>
          <p className="text-2xl font-bold text-white">{bs.payment_count}</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Tasa de cobro</p>
          <p className={`text-2xl font-bold ${collRate >= 80 ? "text-emerald-400" : collRate >= 50 ? "text-amber-400" : "text-red-400"}`}>{collRate.toFixed(0)}%</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Saldo a favor</p>
          <p className="text-2xl font-bold text-cyan-400">${fmt(Number(client.credit_balance || 0))}</p>
        </Card>
      </div>

      {/* Invoices Table */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Receipt size={14} /> Facturas recientes</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-6">Sin facturas registradas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                  <th className="text-left pb-2 font-medium">Nº</th>
                  <th className="text-left pb-2 font-medium">Fecha</th>
                  <th className="text-left pb-2 font-medium">Vence</th>
                  <th className="text-right pb-2 font-medium">Total</th>
                  <th className="text-right pb-2 font-medium">Pagado</th>
                  <th className="text-right pb-2 font-medium">Pendiente</th>
                  <th className="text-center pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const is = INV_STATUS[inv.status] || { label: inv.status, cls: "text-gray-400 bg-gray-400/10" };
                  return (
                    <tr key={inv.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors">
                      <td className="py-2.5 font-mono text-gray-300">{inv.invoice_number}</td>
                      <td className="py-2.5 text-gray-400">{fmtDate(inv.issue_date)}</td>
                      <td className="py-2.5 text-gray-400">{fmtDate(inv.due_date)}</td>
                      <td className="py-2.5 text-right text-gray-200 font-medium">{inv.currency} {fmt(Number(inv.total))}</td>
                      <td className="py-2.5 text-right text-emerald-400">{fmt(Number(inv.amount_paid))}</td>
                      <td className="py-2.5 text-right text-amber-400">{fmt(Number(inv.balance_due))}</td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${is.cls}`}>{is.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payments Table */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><CreditCard size={14} /> Pagos recientes</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-6">Sin pagos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                  <th className="text-left pb-2 font-medium">Nº</th>
                  <th className="text-left pb-2 font-medium">Fecha</th>
                  <th className="text-left pb-2 font-medium">Método</th>
                  <th className="text-left pb-2 font-medium">Referencia</th>
                  <th className="text-right pb-2 font-medium">Monto</th>
                  <th className="text-center pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(pay => {
                  const ps = PAY_STATUS[pay.status] || { label: pay.status, cls: "text-gray-400 bg-gray-400/10" };
                  return (
                    <tr key={pay.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors">
                      <td className="py-2.5 font-mono text-gray-300">{pay.payment_number}</td>
                      <td className="py-2.5 text-gray-400">{fmtDate(pay.payment_date)}</td>
                      <td className="py-2.5 text-gray-400">{pay.payment_methods?.name || "—"}</td>
                      <td className="py-2.5 text-gray-400 font-mono text-xs">{pay.reference_number || "—"}</td>
                      <td className="py-2.5 text-right text-emerald-400 font-medium">{pay.currency} {fmt(Number(pay.amount))}</td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ps.cls}`}>{ps.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ========== TAB: SOPORTE (placeholder - pending CRM Soporte) ========== */
function TabSoporte() {
  return (
    <Card>
      <div className="text-center py-12">
        <Headphones size={48} className="mx-auto mb-4 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-400 mb-2">Historial de Soporte</h3>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          El módulo de CRM de Soporte está en desarrollo. Aquí podrás ver todos los tickets,
          historial de resolución, SLA y calificaciones del cliente.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto">
          <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-2xl font-bold text-gray-500">0</p>
            <p className="text-xs text-gray-600">Tickets</p>
          </div>
          <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-2xl font-bold text-gray-500">—</p>
            <p className="text-xs text-gray-600">SLA</p>
          </div>
          <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-2xl font-bold text-gray-500">—</p>
            <p className="text-xs text-gray-600">Satisfacción</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ========== TAB: RED (placeholder - pending MikroTik integration) ========== */
function TabRed({ client }: { client: ClientDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Radio size={14} /> Información de Red</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <IRow icon={Radio} label="Nodo" value={client.nodo || "Sin asignar"} />
            <IRow icon={Hash} label="Sector" value={client.sector} />
            <IRow icon={Zap} label="Tecnología" value={client.plans?.technology} />
          </div>
          <div className="space-y-3">
            <IRow icon={Hash} label="IP Asignada" value="— (pendiente integración)" />
            <IRow icon={Hash} label="Router Serial" value="— (pendiente)" />
            <IRow icon={Hash} label="ONU Serial" value="— (pendiente)" />
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-center py-8">
          <Radio size={36} className="mx-auto mb-3 text-gray-600" />
          <h3 className="text-base font-semibold text-gray-400 mb-2">Monitoreo en Tiempo Real</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            La integración con MikroTik RouterOS está pendiente. Aquí se mostrará: estado de conexión,
            tráfico en tiempo real, latencia, sesión PPPoE y acciones de gestión remota.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ========== TAB: EQUIPOS (placeholder - pending Inventario) ========== */
function TabEquipos() {
  return (
    <Card>
      <div className="text-center py-12">
        <Package size={48} className="mx-auto mb-4 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-400 mb-2">Equipos Asignados</h3>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          El módulo de Inventario está en desarrollo. Aquí verás los equipos asignados a este cliente:
          router, ONU, cable, conectores, y su historial de cambios.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-4 max-w-sm mx-auto">
          <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-2xl font-bold text-gray-500">0</p>
            <p className="text-xs text-gray-600">Router</p>
          </div>
          <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-2xl font-bold text-gray-500">0</p>
            <p className="text-xs text-gray-600">ONU</p>
          </div>
          <div className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border text-center">
            <p className="text-2xl font-bold text-gray-500">0</p>
            <p className="text-xs text-gray-600">Otros</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
