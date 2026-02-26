"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft, Users, Wifi, WifiOff, Power, Edit2,
  FileText, CreditCard, Headphones, Radio,
  Phone, Mail, MapPin, Calendar, DollarSign,
  Clock, AlertTriangle, CheckCircle,
  RefreshCw, Receipt, TrendingUp, Server,
  User, Hash, Globe, Zap, ExternalLink,
  ShoppingBag, Activity,
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
interface NetworkNode {
  id: string; code: string; name: string; location: string | null;
  type: string | null; technology: string | null; is_active: boolean;
}
interface Ticket {
  id: string; ticket_number: string; subject: string; priority: string;
  status: string; created_at: string; resolved_at: string | null; assigned_to: string | null;
}
interface Lead {
  id: string; code: string; name: string; stage: string;
  product_id: string | null; salesperson_id: string | null;
  source: string; value: number;
  created_at: string; won_at: string | null; lost_at: string | null;
  crm_products?: { name: string } | null;
  crm_salespeople?: { full_name: string } | null;
}
interface InfraHost {
  hostid: string; host: string; name: string; status: number;
  type: string; site: string;
  latency_ms: number | null; packet_loss: number | null;
  uptime_days: number | null;
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
  // New service fields
  plan_name: string | null; plan_type: string | null;
  plan_speed_down: number | null; plan_speed_up: number | null;
  monthly_rate: number | null;
  contract_start: string | null; contract_end: string | null;
  service_ip: string | null; service_mac: string | null;
  service_node_code: string | null; service_technology: string | null;
  service_vlan: string | null; service_router: string | null;
  service_queue_name: string | null;
  odoo_partner_id: number | null; bequant_subscriber_id: string | null;
  // Nested
  plans?: Plan | null;
  invoices: Invoice[];
  payments: Payment[];
  billing_summary: BillingSummary;
  network_node?: NetworkNode | null;
  tickets: Ticket[];
  ticket_count: number;
  leads: Lead[];
}

type Tab = "resumen" | "finanzas" | "soporte" | "ventas" | "infraestructura";

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "resumen", label: "Resumen", icon: User },
  { id: "finanzas", label: "Finanzas", icon: CreditCard },
  { id: "soporte", label: "Soporte", icon: Headphones },
  { id: "ventas", label: "Ventas", icon: TrendingUp },
  { id: "infraestructura", label: "Infraestructura", icon: Radio },
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

const TICKET_STATUS: Record<string, { label: string; cls: string }> = {
  new:             { label: "Nuevo",       cls: "text-blue-400 bg-blue-400/10" },
  assigned:        { label: "Asignado",    cls: "text-cyan-400 bg-cyan-400/10" },
  in_progress:     { label: "En progreso", cls: "text-amber-400 bg-amber-400/10" },
  waiting_client:  { label: "Espera cliente", cls: "text-violet-400 bg-violet-400/10" },
  resolved:        { label: "Resuelto",    cls: "text-emerald-400 bg-emerald-400/10" },
  closed:          { label: "Cerrado",     cls: "text-gray-500 bg-gray-500/10" },
};

const PRIORITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Crítico",  cls: "text-red-400 bg-red-400/10" },
  high:     { label: "Alto",     cls: "text-orange-400 bg-orange-400/10" },
  medium:   { label: "Medio",    cls: "text-amber-400 bg-amber-400/10" },
  low:      { label: "Bajo",     cls: "text-gray-400 bg-gray-400/10" },
};

const STAGE_LABELS: Record<string, { label: string; cls: string }> = {
  incoming:               { label: "Entrante",      cls: "text-blue-400 bg-blue-400/10" },
  contacto_inicial:       { label: "Contacto",      cls: "text-cyan-400 bg-cyan-400/10" },
  info_enviada:           { label: "Info enviada",   cls: "text-violet-400 bg-violet-400/10" },
  en_instalacion:         { label: "Instalación",    cls: "text-amber-400 bg-amber-400/10" },
  prueba_actualizacion:   { label: "Prueba/Upgrade", cls: "text-indigo-400 bg-indigo-400/10" },
  retirado_reactivacion:  { label: "Reactivación",   cls: "text-orange-400 bg-orange-400/10" },
  ganado:                 { label: "Ganado",          cls: "text-emerald-400 bg-emerald-400/10" },
  no_concretado:          { label: "No concretado",  cls: "text-red-400 bg-red-400/10" },
  no_factible:            { label: "No factible",    cls: "text-gray-500 bg-gray-500/10" },
  no_clasificado:         { label: "Sin clasificar", cls: "text-gray-400 bg-gray-400/10" },
};

const TECH_LABELS: Record<string, string> = {
  fiber: "Fibra Óptica", wireless: "Beamforming", terragraph: "Terragraph", copper: "Cobre", mixed: "Mixto",
};

/* ========== HELPERS ========== */
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-VE") : "—";

function daysSince(d: string | null): string {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (diff < 30) return `${diff} días`;
  if (diff < 365) return `${Math.floor(diff / 30)} meses`;
  return `${(diff / 365).toFixed(1)} años`;
}

/* ========== MAIN PAGE ========== */
export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [toggling, setToggling] = useState(false);

  const fetchClient = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/facturacion/clients/${clientId}?detail=true`);
      if (!res.ok) throw new Error("Cliente no encontrado");
      const data = await res.json();
      data.invoices = data.invoices || [];
      data.payments = data.payments || [];
      data.billing_summary = data.billing_summary || {
        total_invoiced: 0, total_paid: 0, total_overdue: 0,
        balance: 0, invoice_count: 0, payment_count: 0,
      };
      data.tickets = data.tickets || [];
      data.ticket_count = data.ticket_count || 0;
      data.leads = data.leads || [];
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

  // Resolve display speed: prefer denormalized fields, fall back to plans join
  const speedDown = client.plan_speed_down || client.plans?.speed_down;
  const speedUp = client.plan_speed_up || client.plans?.speed_up;
  const displayPlan = client.plan_name || client.plans?.name;
  const displayTech = client.service_technology || client.plans?.technology;

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
        {/* HEADER CARD */}
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
                    {client.service_node_code && (
                      <span className="text-xs text-gray-400 bg-wuipi-bg px-2.5 py-1 rounded-full flex items-center gap-1">
                        <Server size={11} /> {client.network_node?.name || client.service_node_code}
                      </span>
                    )}
                    {client.service_ip && (
                      <span className="text-xs font-mono text-cyan-400/80 bg-wuipi-bg px-2.5 py-1 rounded-full">
                        {client.service_ip}
                      </span>
                    )}
                    {displayTech && (
                      <span className="text-xs text-gray-400 bg-wuipi-bg px-2.5 py-1 rounded-full">
                        {TECH_LABELS[displayTech] || displayTech}
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
              <QStat icon={Receipt} label="Facturas" value={`${client.billing_summary?.invoice_count || 0}`} color="text-cyan-400" />
              <QStat icon={Headphones} label="Tickets" value={`${client.ticket_count}`} color="text-violet-400" />
              <QStat icon={Zap} label="Plan / Velocidad" value={displayPlan ? `${displayPlan}${speedDown ? ` ${speedDown}/${speedUp}` : ""}` : "Sin plan"} color="text-emerald-400" />
              <QStat icon={Calendar} label="Antigüedad" value={daysSince(client.created_at)} color="text-amber-400" />
            </div>
          </div>
        </Card>

        {/* TABS */}
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

        {/* TAB CONTENT */}
        {activeTab === "resumen" && <TabResumen client={client} />}
        {activeTab === "finanzas" && <TabFinanzas client={client} />}
        {activeTab === "soporte" && <TabSoporte client={client} />}
        {activeTab === "ventas" && <TabVentas client={client} />}
        {activeTab === "infraestructura" && <TabInfraestructura client={client} />}
      </div>
    </>
  );
}

/* ========== QUICK STAT ========== */
function QStat({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-wuipi-bg rounded-xl border border-wuipi-border">
      <Icon size={16} className={color} />
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm font-bold ${color} truncate`}>{value}</p>
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

/* ========== TAB 1: RESUMEN ========== */
function TabResumen({ client }: { client: ClientDetail }) {
  const speedDown = client.plan_speed_down || client.plans?.speed_down;
  const speedUp = client.plan_speed_up || client.plans?.speed_up;
  const displayPlan = client.plan_name || client.plans?.name;
  const displayTech = client.service_technology || client.plans?.technology;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contacto */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Phone size={14} /> Contacto</h3>
          <div className="space-y-3">
            <IRow icon={Mail} label="Email" value={client.email} />
            <IRow icon={Phone} label="Teléfono" value={client.phone} />
            {client.phone_alt && <IRow icon={Phone} label="Tel. Alternativo" value={client.phone_alt} />}
            {client.contact_person && <IRow icon={User} label="Persona de contacto" value={client.contact_person} />}
          </div>
        </Card>

        {/* Ubicación */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><MapPin size={14} /> Ubicación</h3>
          <div className="space-y-3">
            {client.address && <IRow icon={MapPin} label="Dirección" value={client.address} />}
            <IRow icon={Globe} label="Ciudad / Estado" value={`${client.city || "—"}, ${client.state || "—"}`} />
            <IRow icon={Hash} label="Sector" value={client.sector} />
            <IRow icon={Radio} label="Nodo" value={client.nodo || "Sin asignar"} />
          </div>
        </Card>

        {/* Datos del Servicio */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Server size={14} /> Datos del Servicio</h3>
          <div className="space-y-3">
            <IRow icon={Globe} label="IP de servicio" value={client.service_ip} />
            <IRow icon={Hash} label="MAC Address" value={client.service_mac} />
            <IRow icon={Server} label="Nodo de red" value={client.network_node ? `${client.network_node.name} (${client.service_node_code})` : (client.service_node_code || "Sin asignar")} />
            <IRow icon={Hash} label="VLAN" value={client.service_vlan} />
            <IRow icon={Radio} label="Router / CPE" value={client.service_router} />
            <IRow icon={Zap} label="Tecnología" value={displayTech ? (TECH_LABELS[displayTech] || displayTech) : null} />
            <IRow icon={Hash} label="Queue Name" value={client.service_queue_name} />
          </div>
        </Card>

        {/* Plan */}
        <Card>
          <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Wifi size={14} /> Plan</h3>
          <div className="space-y-3">
            <IRow icon={Zap} label="Plan" value={displayPlan || "Sin plan"} />
            {speedDown && <IRow icon={Activity} label="Velocidad" value={`${speedDown}/${speedUp || "?"} Mbps`} />}
            <IRow icon={DollarSign} label="Tarifa mensual" value={client.monthly_rate ? `$${fmt(client.monthly_rate)}` : (client.plans?.price_usd ? `$${fmt(client.plans.price_usd)}` : null)} />
            <IRow icon={Calendar} label="Inicio contrato" value={fmtDate(client.contract_start)} />
            <IRow icon={Calendar} label="Fin contrato" value={fmtDate(client.contract_end)} />
            <IRow icon={Calendar} label="Instalación" value={fmtDate(client.installation_date)} />
          </div>
        </Card>
      </div>

      {/* Bottom row: Notes + External IDs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {client.notes && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2"><FileText size={14} /> Notas</h3>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{client.notes}</p>
          </Card>
        )}

        {(client.odoo_partner_id || client.bequant_subscriber_id || client.kommo_contact_id) && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2"><ExternalLink size={14} /> IDs Externos</h3>
            <div className="space-y-3">
              {client.odoo_partner_id && <IRow icon={Hash} label="Odoo Partner ID" value={client.odoo_partner_id.toString()} />}
              {client.bequant_subscriber_id && <IRow icon={Hash} label="Bequant Subscriber" value={client.bequant_subscriber_id} />}
              {client.kommo_contact_id && <IRow icon={Hash} label="Kommo Contact ID" value={client.kommo_contact_id.toString()} />}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ========== TAB 2: FINANZAS ========== */
function TabFinanzas({ client }: { client: ClientDetail }) {
  const bs = client.billing_summary || { total_invoiced: 0, total_paid: 0, total_overdue: 0, balance: 0, invoice_count: 0, payment_count: 0 };
  const collRate = bs.total_invoiced > 0 ? ((bs.total_paid / bs.total_invoiced) * 100) : 0;
  const invoices = client.invoices || [];
  const payments = client.payments || [];

  return (
    <div className="space-y-4">
      {/* Odoo Banner */}
      {client.odoo_partner_id ? (
        <div className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
          <CheckCircle size={16} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">
            Conectado con Odoo — Partner ID: <span className="font-mono">{client.odoo_partner_id}</span>
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-400">Sin conexión con Odoo — La facturación detallada se gestiona desde Odoo</p>
        </div>
      )}

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

/* ========== TAB 3: SOPORTE ========== */
function TabSoporte({ client }: { client: ClientDetail }) {
  const router = useRouter();
  const tickets = client.tickets || [];
  const total = client.ticket_count || tickets.length;
  const open = tickets.filter(t => t.status === "new" || t.status === "assigned").length;
  const inProgress = tickets.filter(t => t.status === "in_progress" || t.status === "waiting_client").length;
  const resolved = tickets.filter(t => t.status === "resolved" || t.status === "closed").length;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Total</p>
          <p className="text-2xl font-bold text-white">{total}</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Abiertos</p>
          <p className="text-2xl font-bold text-amber-400">{open}</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">En progreso</p>
          <p className="text-2xl font-bold text-cyan-400">{inProgress}</p>
        </Card>
        <Card className="!p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Resueltos</p>
          <p className="text-2xl font-bold text-emerald-400">{resolved}</p>
        </Card>
      </div>

      {/* Tickets table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2"><Headphones size={14} /> Tickets</h3>
          <button
            onClick={() => router.push("/soporte")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-wuipi-accent/10 text-wuipi-accent border border-wuipi-accent/20 hover:bg-wuipi-accent/20 transition-colors"
          >
            Crear Ticket
          </button>
        </div>

        {tickets.length === 0 ? (
          <div className="text-center py-10">
            <Headphones size={36} className="mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-500 mb-1">Sin tickets registrados</p>
            <p className="text-xs text-gray-600">Los tickets se crean desde el módulo de Soporte</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                  <th className="text-left pb-2 font-medium">Nº</th>
                  <th className="text-left pb-2 font-medium">Asunto</th>
                  <th className="text-center pb-2 font-medium">Prioridad</th>
                  <th className="text-center pb-2 font-medium">Estado</th>
                  <th className="text-left pb-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => {
                  const ts = TICKET_STATUS[t.status] || { label: t.status, cls: "text-gray-400 bg-gray-400/10" };
                  const pr = PRIORITY_CONFIG[t.priority] || { label: t.priority, cls: "text-gray-400 bg-gray-400/10" };
                  return (
                    <tr key={t.id} onClick={() => router.push(`/soporte/${t.id}`)} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer">
                      <td className="py-2.5 font-mono text-gray-300">{t.ticket_number}</td>
                      <td className="py-2.5 text-gray-200">{t.subject}</td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pr.cls}`}>{pr.label}</span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ts.cls}`}>{ts.label}</span>
                      </td>
                      <td className="py-2.5 text-gray-400">{fmtDate(t.created_at)}</td>
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

/* ========== TAB 4: VENTAS ========== */
function TabVentas({ client }: { client: ClientDetail }) {
  const leads = client.leads || [];

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><ShoppingBag size={14} /> Historial de Leads</h3>

        {leads.length === 0 ? (
          <div className="text-center py-10">
            <TrendingUp size={36} className="mx-auto mb-3 text-gray-600" />
            <p className="text-sm text-gray-500 mb-1">Cliente ingresado directamente</p>
            <p className="text-xs text-gray-600">No hay leads de CRM Ventas vinculados a este cliente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map(lead => {
              const stg = STAGE_LABELS[lead.stage] || { label: lead.stage, cls: "text-gray-400 bg-gray-400/10" };
              return (
                <div key={lead.id} className="p-4 bg-wuipi-bg rounded-xl border border-wuipi-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">{lead.code}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stg.cls}`}>{stg.label}</span>
                    </div>
                    <span className="text-xs text-gray-500">{fmtDate(lead.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                    {lead.crm_products?.name && (
                      <span className="flex items-center gap-1"><Zap size={11} /> {lead.crm_products.name}</span>
                    )}
                    {lead.crm_salespeople?.full_name && (
                      <span className="flex items-center gap-1"><User size={11} /> {lead.crm_salespeople.full_name}</span>
                    )}
                    {lead.value > 0 && (
                      <span className="flex items-center gap-1"><DollarSign size={11} /> ${fmt(lead.value)}</span>
                    )}
                    {lead.won_at && (
                      <span className="text-emerald-400">Ganado: {fmtDate(lead.won_at)}</span>
                    )}
                    {lead.lost_at && (
                      <span className="text-red-400">Perdido: {fmtDate(lead.lost_at)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ========== TAB 5: INFRAESTRUCTURA ========== */
function TabInfraestructura({ client }: { client: ClientDetail }) {
  const [infraHost, setInfraHost] = useState<InfraHost | null>(null);
  const [infraLoading, setInfraLoading] = useState(false);
  const [infraChecked, setInfraChecked] = useState(false);

  useEffect(() => {
    if (!client.service_ip) {
      setInfraChecked(true);
      return;
    }
    setInfraLoading(true);
    fetch("/api/infraestructura/hosts")
      .then(r => r.json())
      .then((hosts: InfraHost[]) => {
        const match = hosts.find(h => h.host === client.service_ip || h.name?.includes(client.service_ip!));
        setInfraHost(match || null);
      })
      .catch(() => {})
      .finally(() => {
        setInfraLoading(false);
        setInfraChecked(true);
      });
  }, [client.service_ip]);

  if (!client.service_ip) {
    return (
      <Card>
        <div className="text-center py-10">
          <Radio size={36} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm text-gray-500 mb-1">Sin IP de servicio asignada</p>
          <p className="text-xs text-gray-600">Asigna una IP de servicio al cliente para vincular con el monitoreo de red</p>
        </div>
      </Card>
    );
  }

  if (infraLoading || !infraChecked) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
          <span className="ml-2 text-gray-500 text-sm">Buscando equipo en monitoreo...</span>
        </div>
      </Card>
    );
  }

  if (!infraHost) {
    return (
      <Card>
        <div className="text-center py-10">
          <Radio size={36} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm text-gray-500 mb-1">Sin equipo monitoreado asociado</p>
          <p className="text-xs text-gray-600">
            IP <span className="font-mono text-cyan-400/80">{client.service_ip}</span> no encontrada en el sistema de monitoreo (Zabbix)
          </p>
        </div>
      </Card>
    );
  }

  const isUp = infraHost.status === 1;

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-semibold text-gray-400 mb-4 flex items-center gap-2"><Radio size={14} /> Monitoreo del Equipo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-3 h-3 rounded-full ${isUp ? "bg-emerald-400" : "bg-red-400"} animate-pulse`} />
              <span className={`text-sm font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? "En línea" : "Fuera de línea"}
              </span>
            </div>
            <IRow icon={Server} label="Host" value={infraHost.name || infraHost.host} />
            <IRow icon={Hash} label="Tipo" value={infraHost.type || "—"} />
            <IRow icon={MapPin} label="Sitio" value={infraHost.site || "—"} />
          </div>
          <div className="space-y-3">
            <IRow icon={Activity} label="Latencia" value={infraHost.latency_ms != null ? `${infraHost.latency_ms.toFixed(1)} ms` : "—"} />
            <IRow icon={AlertTriangle} label="Pérdida de paquetes" value={infraHost.packet_loss != null ? `${infraHost.packet_loss.toFixed(1)}%` : "—"} />
            <IRow icon={Clock} label="Uptime" value={infraHost.uptime_days != null ? `${infraHost.uptime_days.toFixed(1)} días` : "—"} />
          </div>
        </div>
      </Card>
    </div>
  );
}
