"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/dashboard";
import {
  FileText, Users, Receipt, CreditCard, Package,
  Plus, Search, RefreshCw, AlertTriangle, ArrowUpDown,
  DollarSign, TrendingUp, Clock, ChevronRight, X,
  Edit2, Trash2, Check, ExternalLink, Save,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface Stats {
  total_clients: number; active_clients: number;
  invoiced_usd: number; invoiced_ves: number;
  invoices_this_month: number; invoices_paid: number;
  collected_usd: number; collected_ves: number;
  overdue_invoices: any[]; overdue_count: number;
  overdue_total_usd: number; pending_payments: number;
  collection_rate: number; exchange_rate: number | null;
}
interface Client {
  id: string; code: string; legal_name: string; trade_name: string;
  document_type: string; document_number: string; email: string;
  phone: string; service_status: string; billing_currency: string;
  plans?: { code: string; name: string; price_usd: number } | null;
  created_at: string;
}
interface Invoice {
  id: string; invoice_number: string; client_name: string; client_id: string;
  issue_date: string; due_date: string; currency: string;
  subtotal: number; total: number; amount_paid: number; balance_due: number;
  status: string; invoice_type: string;
  clients?: { code: string; legal_name: string; trade_name: string };
}
interface Payment {
  id: string; payment_number: string; amount: number; currency: string;
  payment_date: string; status: string; reference_number: string;
  clients?: { code: string; legal_name: string };
  invoices?: { invoice_number: string } | null;
  payment_methods?: { name: string; code: string };
}

type Tab = "overview" | "clients" | "invoices" | "payments" | "catalog" | "inventario" | "compras" | "contabilidad" | "rrhh";

// ============================================
// HELPER COMPONENTS
// ============================================
function KPI({ label, value, sub, icon: Icon, color = "text-white" }: {
  label: string; value: string | number; sub?: string; icon: any; color?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-gray-500" />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-400",
    sent: "bg-blue-500/10 text-blue-400",
    partial: "bg-amber-500/10 text-amber-400",
    paid: "bg-emerald-500/10 text-emerald-400",
    overdue: "bg-red-500/10 text-red-400",
    cancelled: "bg-gray-500/10 text-gray-500",
    void: "bg-gray-500/10 text-gray-500",
    pending: "bg-amber-500/10 text-amber-400",
    confirmed: "bg-emerald-500/10 text-emerald-400",
    rejected: "bg-red-500/10 text-red-400",
    active: "bg-emerald-500/10 text-emerald-400",
    suspended: "bg-red-500/10 text-red-400",
    cancelled_svc: "bg-gray-500/10 text-gray-500",
  };
  const labels: Record<string, string> = {
    draft: "Borrador", sent: "Enviada", partial: "Parcial", paid: "Pagada",
    overdue: "Vencida", cancelled: "Anulada", void: "Anulada",
    pending: "Pendiente", confirmed: "Confirmado", rejected: "Rechazado",
    active: "Activo", suspended: "Suspendido",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${colors[status] || colors.draft}`}>
      {labels[status] || status}
    </span>
  );
}

function TabButton({ tab, current, icon: Icon, label, count, onClick }: {
  tab: Tab; current: Tab; icon: any; label: string; count?: number; onClick: (t: Tab) => void;
}) {
  const active = tab === current;
  return (
    <button
      onClick={() => onClick(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
        active
          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
          : "text-gray-500 hover:text-gray-300 border border-transparent"
      }`}
    >
      <Icon size={16} />
      {label}
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? "bg-cyan-500/20" : "bg-gray-700"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function fmtMoney(n: number, currency = "USD") {
  if (currency === "VES") return `Bs. ${n.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

// ============================================
// MODAL: New/Edit Client
// ============================================
function ClientModal({ client, plans, onSave, onClose }: {
  client?: Client | null; plans: any[]; onSave: (data: any) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    legal_name: client?.legal_name || "",
    trade_name: client?.trade_name || "",
    document_type: client?.document_type || "J",
    document_number: client?.document_number || "",
    email: client?.email || "",
    phone: client?.phone || "",
    service_status: client?.service_status || "active",
    billing_currency: client?.billing_currency || "USD",
    plan_id: (client as any)?.plan_id || "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-wuipi-card border border-wuipi-border rounded-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-white">{client ? "Editar Cliente" : "Nuevo Cliente"}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Razón Social *</label>
            <input value={form.legal_name} onChange={e => set("legal_name", e.target.value)}
              className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nombre Comercial</label>
            <input value={form.trade_name} onChange={e => set("trade_name", e.target.value)}
              className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo Doc</label>
              <select value={form.document_type} onChange={e => set("document_type", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="V">V</option><option value="J">J</option>
                <option value="E">E</option><option value="G">G</option><option value="P">P</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nro. Documento *</label>
              <input value={form.document_number} onChange={e => set("document_number", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Teléfono</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Plan</label>
              <select value={form.plan_id} onChange={e => set("plan_id", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Sin plan</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} (${p.price_usd})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Moneda</label>
              <select value={form.billing_currency} onChange={e => set("billing_currency", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="USD">USD</option><option value="VES">VES</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Estado</label>
              <select value={form.service_status} onChange={e => set("service_status", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="active">Activo</option><option value="suspended">Suspendido</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
          <button onClick={() => onSave({ ...form, plan_id: form.plan_id || null })}
            className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20">
            <Save size={14} className="inline mr-1" /> {client ? "Guardar" : "Crear Cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL: New Invoice
// ============================================
function InvoiceModal({ clients, plans, services, exchangeRate, onSave, onClose }: {
  clients: Client[]; plans: any[]; services: any[]; exchangeRate: number | null;
  onSave: (data: any) => void; onClose: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [items, setItems] = useState<any[]>([]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });

  const addPlanItem = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;
    setItems(prev => [...prev, {
      item_type: "plan", plan_id: plan.id,
      description: `${plan.name} - Servicio mensual`,
      quantity: 1, unit_price: plan.price_usd, taxable: true, tax_rate: 16,
    }]);
  };

  const addServiceItem = (serviceId: string) => {
    const svc = services.find(s => s.id === serviceId);
    if (!svc) return;
    setItems(prev => [...prev, {
      item_type: "service", service_id: svc.id,
      description: svc.name,
      quantity: 1, unit_price: svc.price_usd, taxable: svc.taxable, tax_rate: 16,
    }]);
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const iva = items.reduce((s, i) => s + (i.taxable ? i.quantity * i.unit_price * 0.16 : 0), 0);
  const igtf = currency !== "VES" ? (subtotal + iva) * 0.03 : 0;
  const total = subtotal + iva + igtf;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-wuipi-card border border-wuipi-border rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-white">Nueva Factura</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          {/* Client + Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Cliente *</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Seleccionar cliente...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.code} — {c.legal_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Moneda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="USD">USD</option><option value="VES">VES</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fecha de Vencimiento</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          {/* Add items */}
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Agregar Ítems</label>
            <div className="flex gap-2">
              <select onChange={e => { if (e.target.value) { addPlanItem(e.target.value); e.target.value = ""; } }}
                className="flex-1 bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">+ Plan de servicio...</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${p.price_usd}</option>)}
              </select>
              <select onChange={e => { if (e.target.value) { addServiceItem(e.target.value); e.target.value = ""; } }}
                className="flex-1 bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">+ Servicio puntual...</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price_usd}</option>)}
              </select>
            </div>
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="border border-wuipi-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-wuipi-bg">
                  <tr className="text-gray-500 text-xs">
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-right w-16">Cant</th>
                    <th className="px-3 py-2 text-right w-24">Precio</th>
                    <th className="px-3 py-2 text-right w-24">Subtotal</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-wuipi-border">
                      <td className="px-3 py-2 text-white">{item.description}</td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={1} value={item.quantity}
                          onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) || 1 } : it))}
                          className="w-14 bg-wuipi-bg border border-wuipi-border rounded px-2 py-1 text-right text-white text-xs" />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300">{fmtMoney(item.unit_price, currency)}</td>
                      <td className="px-3 py-2 text-right text-white font-medium">{fmtMoney(item.quantity * item.unit_price, currency)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-400"><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          {items.length > 0 && (
            <div className="bg-wuipi-bg rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white">{fmtMoney(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">IVA (16%)</span>
                <span className="text-white">{fmtMoney(iva, currency)}</span>
              </div>
              {igtf > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">IGTF (3%)</span>
                  <span className="text-amber-400">{fmtMoney(igtf, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-wuipi-border pt-2">
                <span className="text-white">Total</span>
                <span className="text-cyan-400">{fmtMoney(total, currency)}</span>
              </div>
              {exchangeRate && currency === "USD" && (
                <div className="text-xs text-gray-500 text-right">
                  ≈ Bs. {(total * exchangeRate).toLocaleString("es-VE", { minimumFractionDigits: 2 })} @ {exchangeRate} Bs/$
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
          <button
            disabled={!clientId || items.length === 0}
            onClick={() => onSave({
              client_id: clientId, currency, due_date: dueDate,
              exchange_rate: currency === "USD" && exchangeRate ? exchangeRate : 1,
              items,
            })}
            className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-sm font-semibold hover:bg-cyan-500/20 disabled:opacity-30"
          >
            <FileText size={14} className="inline mr-1" /> Crear Factura
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODAL: New Payment
// ============================================
function PaymentModal({ clients, invoices, paymentMethods, onSave, onClose }: {
  clients: Client[]; invoices: Invoice[]; paymentMethods: any[];
  onSave: (data: any) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    client_id: "", invoice_id: "", payment_method_id: "",
    amount: "", currency: "USD", reference_number: "", notes: "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const clientInvoices = invoices.filter(i =>
    i.client_id === form.client_id && ["sent", "partial", "overdue"].includes(i.status)
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-wuipi-card border border-wuipi-border rounded-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-white">Registrar Pago</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cliente *</label>
            <select value={form.client_id} onChange={e => set("client_id", e.target.value)}
              className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Seleccionar...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.code} — {c.legal_name}</option>)}
            </select>
          </div>
          {form.client_id && clientInvoices.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Factura (opcional)</label>
              <select value={form.invoice_id} onChange={e => set("invoice_id", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Pago sin factura / anticipado</option>
                {clientInvoices.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number} — Pendiente: {fmtMoney(i.balance_due, i.currency)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Método de Pago *</label>
            <select value={form.payment_method_id} onChange={e => set("payment_method_id", e.target.value)}
              className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Seleccionar...</option>
              {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Monto *</label>
              <input type="number" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Moneda</label>
              <select value={form.currency} onChange={e => set("currency", e.target.value)}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="USD">USD</option><option value="VES">VES</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nro. Referencia</label>
            <input value={form.reference_number} onChange={e => set("reference_number", e.target.value)}
              className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Referencia bancaria, ID transacción..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
          <button
            disabled={!form.client_id || !form.amount || !form.payment_method_id}
            onClick={() => onSave({
              ...form,
              amount: parseFloat(form.amount),
              invoice_id: form.invoice_id || null,
              status: "pending",
            })}
            className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm font-semibold hover:bg-emerald-500/20 disabled:opacity-30"
          >
            <CreditCard size={14} className="inline mr-1" /> Registrar Pago
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function FacturacionPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [catalog, setCatalog] = useState<{ plans: any[]; services: any[]; payment_methods: any[] }>({ plans: [], services: [], payment_methods: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"client" | "invoice" | "payment" | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/facturacion/stats");
      const data = await res.json();
      if (!data.error) setStats(data);
    } catch {}
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/facturacion/clients?${params}`);
      const data = await res.json();
      setClients(data.data || []);
    } catch {}
  }, [search, statusFilter]);

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/facturacion/invoices?${params}`);
      const data = await res.json();
      setInvoices(data.data || []);
    } catch {}
  }, [search, statusFilter]);

  const fetchPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/facturacion/payments?${params}`);
      const data = await res.json();
      setPayments(data.data || []);
    } catch {}
  }, [search, statusFilter]);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/facturacion/catalog");
      const data = await res.json();
      if (!data.error) setCatalog(data);
    } catch {}
  }, []);

  // Load all data
  useEffect(() => {
    Promise.all([fetchStats(), fetchCatalog()]).then(() => setLoading(false));
  }, [fetchStats, fetchCatalog]);

  // Reload on tab change
  useEffect(() => {
    if (tab === "clients") fetchClients();
    if (tab === "invoices") fetchInvoices();
    if (tab === "payments") fetchPayments();
    if (tab === "catalog") fetchCatalog();
  }, [tab, fetchClients, fetchInvoices, fetchPayments, fetchCatalog]);

  // Reload on search/filter change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tab === "clients") fetchClients();
      if (tab === "invoices") fetchInvoices();
      if (tab === "payments") fetchPayments();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, tab, fetchClients, fetchInvoices, fetchPayments]);

  // --- CRUD handlers ---
  const handleSaveClient = async (data: any) => {
    try {
      if (editClient) {
        await fetch(`/api/facturacion/clients/${editClient.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      } else {
        await fetch("/api/facturacion/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      }
      setModal(null);
      setEditClient(null);
      fetchClients();
      fetchStats();
    } catch {}
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    await fetch(`/api/facturacion/clients/${id}`, { method: "DELETE" });
    fetchClients();
    fetchStats();
  };

  const handleSaveInvoice = async (data: any) => {
    try {
      await fetch("/api/facturacion/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      setModal(null);
      fetchInvoices();
      fetchStats();
    } catch {}
  };

  const handleInvoiceAction = async (id: string, action: string) => {
    const updates: any = {};
    if (action === "send") updates.status = "sent";
    if (action === "cancel") updates.status = "cancelled";
    await fetch(`/api/facturacion/invoices/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    fetchInvoices();
    fetchStats();
  };

  const handleSavePayment = async (data: any) => {
    try {
      await fetch("/api/facturacion/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      setModal(null);
      fetchPayments();
      fetchStats();
    } catch {}
  };

  const handleConfirmPayment = async (id: string) => {
    await fetch("/api/facturacion/payments", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "confirmed", confirmed_at: new Date().toISOString() }),
    });
    fetchPayments();
    fetchInvoices();
    fetchStats();
  };

  if (loading) {
    return (
      <>
        <TopBar title="ERP Administrativo" icon={<FileText size={22} />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw size={20} className="animate-spin" /> Cargando módulo de facturación...
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="ERP Administrativo" icon={<FileText size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Tab Navigation — ERP Modules */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {/* Facturación section */}
          <TabButton tab="overview" current={tab} icon={TrendingUp} label="Resumen" onClick={setTab} />
          <TabButton tab="clients" current={tab} icon={Users} label="Clientes" count={stats?.total_clients} onClick={setTab} />
          <TabButton tab="invoices" current={tab} icon={Receipt} label="Facturas" count={stats?.invoices_this_month} onClick={setTab} />
          <TabButton tab="payments" current={tab} icon={CreditCard} label="Pagos" count={stats?.pending_payments} onClick={setTab} />
          <TabButton tab="catalog" current={tab} icon={Package} label="Catálogo" onClick={setTab} />
          {/* Separator */}
          <div className="h-6 w-px bg-wuipi-border mx-1 shrink-0" />
          {/* Other ERP modules (próximamente) */}
          <TabButton tab="inventario" current={tab} icon={Package} label="Inventario" onClick={setTab} />
          <TabButton tab="compras" current={tab} icon={Receipt} label="Compras" onClick={setTab} />
          <TabButton tab="contabilidad" current={tab} icon={DollarSign} label="Contabilidad" onClick={setTab} />
          <TabButton tab="rrhh" current={tab} icon={Users} label="RRHH" onClick={setTab} />
        </div>

        {/* ===== OVERVIEW TAB ===== */}
        {tab === "overview" && stats && (
          <>
            <div className="grid grid-cols-6 gap-3">
              <Card className="flex flex-col items-center justify-center py-3">
                <ScoreRing score={stats.collection_rate} size={68} />
                <p className="text-xs font-semibold text-white mt-2">Cobranza</p>
              </Card>
              <KPI label="Facturado USD" value={fmtMoney(stats.invoiced_usd)} sub={`${stats.invoices_this_month} facturas este mes`} icon={Receipt} color="text-cyan-400" />
              <KPI label="Cobrado USD" value={fmtMoney(stats.collected_usd)} sub={`${stats.invoices_paid} pagadas`} icon={DollarSign} color="text-emerald-400" />
              <KPI label="Clientes Activos" value={stats.active_clients} sub={`${stats.total_clients} total`} icon={Users} />
              <KPI label="Vencidas" value={stats.overdue_count} sub={stats.overdue_total_usd > 0 ? fmtMoney(stats.overdue_total_usd) + " pendiente" : "Al día"} icon={AlertTriangle} color={stats.overdue_count > 0 ? "text-red-400" : "text-emerald-400"} />
              <KPI label="Tasa USD/VES" value={stats.exchange_rate ? `Bs. ${stats.exchange_rate}` : "No fijada"} sub="BCV" icon={ArrowUpDown} />
            </div>

            {/* Overdue invoices */}
            {stats.overdue_invoices.length > 0 && (
              <Card>
                <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} /> Facturas Vencidas ({stats.overdue_count})
                </h3>
                <div className="space-y-2">
                  {stats.overdue_invoices.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                      <div>
                        <span className="text-sm font-mono text-red-400">{inv.invoice_number}</span>
                        <span className="text-sm text-gray-300 ml-3">{inv.client_name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-red-400">{fmtMoney(inv.balance_due, inv.currency)}</p>
                        <p className="text-[10px] text-gray-500">Venció: {fmtDate(inv.due_date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* ===== CLIENTS TAB ===== */}
        {tab === "clients" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, código, RIF..."
                  className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg pl-9 pr-3 py-2 text-sm text-white" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Todos</option>
                <option value="active">Activos</option>
                <option value="suspended">Suspendidos</option>
              </select>
              <button onClick={() => { setEditClient(null); setModal("client"); }}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-sm font-semibold">
                <Plus size={16} /> Nuevo Cliente
              </button>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Razón Social</th>
                      <th className="px-3 py-2 text-left">RIF/CI</th>
                      <th className="px-3 py-2 text-left">Plan</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                      <th className="px-3 py-2 text-center">Moneda</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.id} className="border-t border-wuipi-border hover:bg-wuipi-bg/50">
                        <td className="px-3 py-2.5 font-mono text-cyan-400 text-xs">{c.code}</td>
                        <td className="px-3 py-2.5">
                          <p className="text-white font-medium">{c.legal_name}</p>
                          {c.trade_name && <p className="text-[11px] text-gray-500">{c.trade_name}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-300">{c.document_type}-{c.document_number}</td>
                        <td className="px-3 py-2.5 text-gray-300">{c.plans?.name || "—"}</td>
                        <td className="px-3 py-2.5 text-center"><StatusBadge status={c.service_status} /></td>
                        <td className="px-3 py-2.5 text-center text-gray-400">{c.billing_currency}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => { setEditClient(c); setModal("client"); }}
                            className="text-gray-500 hover:text-cyan-400 mr-2"><Edit2 size={14} /></button>
                          <button onClick={() => handleDeleteClient(c.id)}
                            className="text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    ))}
                    {clients.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">No se encontraron clientes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ===== INVOICES TAB ===== */}
        {tab === "invoices" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por número, cliente..."
                  className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg pl-9 pr-3 py-2 text-sm text-white" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Todos</option>
                <option value="draft">Borrador</option>
                <option value="sent">Enviada</option>
                <option value="partial">Parcial</option>
                <option value="paid">Pagada</option>
                <option value="overdue">Vencida</option>
              </select>
              <button onClick={() => { fetchClients(); setModal("invoice"); }}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-sm font-semibold">
                <Plus size={16} /> Nueva Factura
              </button>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                      <th className="px-3 py-2 text-left">Nro. Factura</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-center">Fecha</th>
                      <th className="px-3 py-2 text-center">Vence</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Pendiente</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-t border-wuipi-border hover:bg-wuipi-bg/50">
                        <td className="px-3 py-2.5 font-mono text-cyan-400 text-xs">{inv.invoice_number}</td>
                        <td className="px-3 py-2.5 text-white">{inv.client_name}</td>
                        <td className="px-3 py-2.5 text-center text-gray-300 text-xs">{fmtDate(inv.issue_date)}</td>
                        <td className="px-3 py-2.5 text-center text-gray-300 text-xs">{fmtDate(inv.due_date)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-white">{fmtMoney(inv.total, inv.currency)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-amber-400">{fmtMoney(inv.balance_due, inv.currency)}</td>
                        <td className="px-3 py-2.5 text-center"><StatusBadge status={inv.status} /></td>
                        <td className="px-3 py-2.5 text-right">
                          {inv.status === "draft" && (
                            <button onClick={() => handleInvoiceAction(inv.id, "send")}
                              className="text-gray-500 hover:text-blue-400 mr-2" title="Enviar">
                              <ExternalLink size={14} />
                            </button>
                          )}
                          {["draft", "sent"].includes(inv.status) && (
                            <button onClick={() => handleInvoiceAction(inv.id, "cancel")}
                              className="text-gray-500 hover:text-red-400" title="Anular">
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {invoices.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">No se encontraron facturas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ===== PAYMENTS TAB ===== */}
        {tab === "payments" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por referencia, número de pago..."
                  className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg pl-9 pr-3 py-2 text-sm text-white" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">Todos</option>
                <option value="pending">Pendiente</option>
                <option value="confirmed">Confirmado</option>
                <option value="rejected">Rechazado</option>
              </select>
              <button onClick={() => { fetchClients(); fetchInvoices(); setModal("payment"); }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm font-semibold">
                <Plus size={16} /> Registrar Pago
              </button>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                      <th className="px-3 py-2 text-left">Nro. Pago</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">Factura</th>
                      <th className="px-3 py-2 text-left">Método</th>
                      <th className="px-3 py-2 text-center">Fecha</th>
                      <th className="px-3 py-2 text-right">Monto</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-t border-wuipi-border hover:bg-wuipi-bg/50">
                        <td className="px-3 py-2.5 font-mono text-emerald-400 text-xs">{p.payment_number}</td>
                        <td className="px-3 py-2.5 text-white">{p.clients?.legal_name || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-300 text-xs font-mono">{p.invoices?.invoice_number || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-300">{p.payment_methods?.name || "—"}</td>
                        <td className="px-3 py-2.5 text-center text-gray-300 text-xs">{fmtDate(p.payment_date)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-white">{fmtMoney(p.amount, p.currency)}</td>
                        <td className="px-3 py-2.5 text-center"><StatusBadge status={p.status} /></td>
                        <td className="px-3 py-2.5 text-right">
                          {p.status === "pending" && (
                            <button onClick={() => handleConfirmPayment(p.id)}
                              className="text-gray-500 hover:text-emerald-400" title="Confirmar">
                              <Check size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-500">No se encontraron pagos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* ===== CATALOG TAB ===== */}
        {tab === "catalog" && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Package size={16} /> Planes de Servicio
              </h3>
              <div className="space-y-2">
                {catalog.plans.map(p => (
                  <div key={p.id} className="p-3 bg-wuipi-bg border border-wuipi-border rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <p className="text-[11px] text-gray-500">{p.code} • {p.technology} • {p.speed_down}/{p.speed_up} Mbps</p>
                    </div>
                    <p className="text-lg font-bold text-cyan-400">${p.price_usd}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <FileText size={16} /> Servicios Puntuales
              </h3>
              <div className="space-y-2">
                {catalog.services.map(s => (
                  <div key={s.id} className="p-3 bg-wuipi-bg border border-wuipi-border rounded-lg flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{s.name}</p>
                      <p className="text-[11px] text-gray-500">{s.code} • {s.category}</p>
                    </div>
                    <p className="text-lg font-bold text-emerald-400">${s.price_usd}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="col-span-2">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <CreditCard size={16} /> Métodos de Pago
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {catalog.payment_methods.map(pm => (
                  <div key={pm.id} className={`p-3 rounded-lg border ${pm.is_primary ? "bg-cyan-500/5 border-cyan-500/20" : "bg-wuipi-bg border-wuipi-border"}`}>
                    <p className="text-sm font-medium text-white">{pm.name}</p>
                    <p className="text-[11px] text-gray-500">{pm.type} • {pm.currency}</p>
                    {pm.is_primary && <span className="text-[10px] text-cyan-400 font-semibold">★ Principal</span>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ===== INVENTARIO TAB (Próximamente) ===== */}
        {tab === "inventario" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <Package size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Inventario</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Gestión de equipos (routers, ONUs, cable), asignación a clientes, 
              movimientos de stock y trazabilidad completa de seriales.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente — Phase 9B
            </div>
          </Card>
        )}

        {/* ===== COMPRAS TAB (Próximamente) ===== */}
        {tab === "compras" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <Receipt size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Compras</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Órdenes de compra, gestión de proveedores nacionales e internacionales, 
              recepción de mercancía y tracking de importaciones.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente — Phase 9C
            </div>
          </Card>
        )}

        {/* ===== CONTABILIDAD TAB (Próximamente) ===== */}
        {tab === "contabilidad" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <DollarSign size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Contabilidad</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Plan de cuentas venezolano, libro diario automático, balance general, 
              estado de resultados e integración SENIAT.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente — Phase 9D
            </div>
          </Card>
        )}

        {/* ===== RRHH TAB (Próximamente) ===== */}
        {tab === "rrhh" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <Users size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Recursos Humanos</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Fichas de empleados, nómina quincenal (IVSS, FAOV), control de asistencia, 
              vacaciones y permisos del equipo técnico.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente — Phase 9E
            </div>
          </Card>
        )}
      </div>

      {/* MODALS */}
      {modal === "client" && (
        <ClientModal client={editClient} plans={catalog.plans} onSave={handleSaveClient} onClose={() => { setModal(null); setEditClient(null); }} />
      )}
      {modal === "invoice" && (
        <InvoiceModal
          clients={clients} plans={catalog.plans} services={catalog.services}
          exchangeRate={stats?.exchange_rate || null}
          onSave={handleSaveInvoice} onClose={() => setModal(null)}
        />
      )}
      {modal === "payment" && (
        <PaymentModal
          clients={clients} invoices={invoices} paymentMethods={catalog.payment_methods}
          onSave={handleSavePayment} onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
