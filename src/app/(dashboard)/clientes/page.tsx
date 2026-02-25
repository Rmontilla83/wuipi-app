"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Users, Search, Plus, X, Save,
  Wifi, WifiOff, AlertTriangle, Phone, Mail,
  Clock, Edit2, Trash2, Power,
  MapPin, FileText, CreditCard,
} from "lucide-react";

// ============================================
// TYPES
// ============================================
interface Client {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  phone_alt: string;
  contact_person: string;
  address: string;
  city: string;
  state: string;
  sector: string;
  nodo: string;
  plan_id: string | null;
  service_status: string;
  installation_date: string | null;
  billing_currency: string;
  billing_day: number;
  notes: string;
  created_at: string;
  plans?: { id: string; code: string; name: string; price_usd: number } | null;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  speed_mbps: number;
  price_usd: number;
  is_active: boolean;
}

const EMPTY_FORM = {
  legal_name: "",
  trade_name: "",
  document_type: "V",
  document_number: "",
  email: "",
  phone: "",
  phone_alt: "",
  contact_person: "",
  address: "",
  city: "",
  state: "Anzoátegui",
  sector: "",
  nodo: "",
  plan_id: "",
  service_status: "active",
  installation_date: "",
  billing_currency: "USD",
  billing_day: 1,
  notes: "",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  active: { label: "Activo", color: "text-emerald-400", bg: "bg-emerald-400/10", icon: Wifi },
  suspended: { label: "Suspendido", color: "text-red-400", bg: "bg-red-400/10", icon: WifiOff },
  pending: { label: "Pendiente", color: "text-amber-400", bg: "bg-amber-400/10", icon: Clock },
  cancelled: { label: "Cancelado", color: "text-gray-500", bg: "bg-gray-500/10", icon: AlertTriangle },
};

const DOC_TYPES = [
  { value: "V", label: "V - Cédula" },
  { value: "J", label: "J - RIF Jurídico" },
  { value: "E", label: "E - Extranjero" },
  { value: "G", label: "G - Gobierno" },
  { value: "P", label: "P - Pasaporte" },
];

// ============================================
// MAIN PAGE
// ============================================
export default function ClientesPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, pending: 0 });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Debounce search
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [search]);

  // Fetch plans on mount
  useEffect(() => {
    fetch("/api/facturacion/catalog?type=plans")
      .then(r => r.json())
      .then(d => setPlans(d.plans || []))
      .catch(() => {});
  }, []);

  // Fetch clients
  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/facturacion/clients?${params}`);
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : (json.data || []);
        setClients(data);
        setTotal(json.total || data.length);
        setStats({
          total: json.total || data.length,
          active: data.filter((c: Client) => c.service_status === "active").length,
          suspended: data.filter((c: Client) => c.service_status === "suspended").length,
          pending: data.filter((c: Client) => c.service_status === "pending").length,
        });
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Open create modal
  const openCreate = () => {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowModal(true);
  };

  // Open edit modal
  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      legal_name: client.legal_name || "",
      trade_name: client.trade_name || "",
      document_type: client.document_type || "V",
      document_number: client.document_number || "",
      email: client.email || "",
      phone: client.phone || "",
      phone_alt: client.phone_alt || "",
      contact_person: client.contact_person || "",
      address: client.address || "",
      city: client.city || "",
      state: client.state || "Anzoátegui",
      sector: client.sector || "",
      nodo: client.nodo || "",
      plan_id: client.plan_id || "",
      service_status: client.service_status || "active",
      installation_date: client.installation_date || "",
      billing_currency: client.billing_currency || "USD",
      billing_day: client.billing_day || 1,
      notes: client.notes || "",
    });
    setError("");
    setShowModal(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!form.legal_name.trim()) { setError("El nombre es obligatorio"); return; }
    if (!form.document_number.trim()) { setError("El documento es obligatorio"); return; }

    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        plan_id: form.plan_id || null,
        installation_date: form.installation_date || null,
      };

      const url = editingClient
        ? `/api/facturacion/clients/${editingClient.id}`
        : "/api/facturacion/clients";

      const res = await fetch(url, {
        method: editingClient ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }

      setShowModal(false);
      fetchClients();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Toggle status (active <-> suspended)
  const toggleStatus = async (client: Client) => {
    const newStatus = client.service_status === "active" ? "suspended" : "active";
    try {
      const res = await fetch(`/api/facturacion/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_status: newStatus }),
      });
      if (res.ok) fetchClients();
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  // Delete (soft)
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/facturacion/clients/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchClients();
      }
    } catch (err) {
      console.error("Error deleting client:", err);
    }
  };

  // Form field helper
  const setField = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <>
      <TopBar title="Clientes" subtitle={`${total} registrados`} icon={<Users size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-white", bg: "border-wuipi-accent/20" },
            { label: "Activos", value: stats.active, color: "text-emerald-400", bg: "border-emerald-400/20" },
            { label: "Suspendidos", value: stats.suspended, color: "text-red-400", bg: "border-red-400/20" },
            { label: "Pendientes", value: stats.pending, color: "text-amber-400", bg: "border-amber-400/20" },
          ].map(s => (
            <Card key={s.label} className={`${s.bg} !p-4`}>
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, cédula, código, email..."
              className="w-full bg-wuipi-card border border-wuipi-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-wuipi-card border border-wuipi-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="suspended">Suspendidos</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-wuipi-accent text-black px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-wuipi-accent/90 transition-colors shrink-0"
          >
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>

        {/* Client List */}
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Cargando clientes...</div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-semibold text-white mb-2">
                {debouncedSearch || statusFilter !== "all" ? "Sin resultados" : "Sin clientes aún"}
              </h3>
              <p className="text-gray-500 text-sm mb-4">
                {debouncedSearch || statusFilter !== "all"
                  ? "Intenta con otros filtros de búsqueda."
                  : "Agrega tu primer cliente para comenzar."}
              </p>
              {!debouncedSearch && statusFilter === "all" && (
                <button onClick={openCreate} className="bg-wuipi-accent text-black px-4 py-2 rounded-lg text-sm font-semibold">
                  <Plus size={16} className="inline mr-1" /> Crear primer cliente
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wuipi-border text-gray-500 text-xs uppercase">
                    <th className="text-left p-3 pl-4">Cliente</th>
                    <th className="text-left p-3">Plan</th>
                    <th className="text-left p-3">Sector / Nodo</th>
                    <th className="text-left p-3">Contacto</th>
                    <th className="text-center p-3">Estado</th>
                    <th className="text-right p-3 pr-4">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(client => {
                    const status = STATUS_CONFIG[client.service_status] || STATUS_CONFIG.pending;
                    const StatusIcon = status.icon;
                    return (
                      <tr key={client.id} onClick={() => router.push(`/clientes/${client.id}`)} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer">
                        <td className="p-3 pl-4">
                          <div>
                            <p className="text-white font-medium">{client.legal_name}</p>
                            <p className="text-gray-500 text-xs">
                              {client.code} • {client.document_type}-{client.document_number}
                            </p>
                          </div>
                        </td>
                        <td className="p-3">
                          {client.plans ? (
                            <div>
                              <span className="text-gray-300 text-xs">{client.plans.name}</span>
                              <span className="text-gray-600 text-xs ml-1">${client.plans.price_usd}</span>
                            </div>
                          ) : (
                            <span className="text-gray-600 text-xs">Sin plan</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="text-gray-400 text-xs">
                            {client.sector || "—"}
                            {client.nodo && <span className="text-gray-600"> / {client.nodo}</span>}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5">
                            {client.phone && (
                              <span className="flex items-center gap-1 text-gray-500 text-xs">
                                <Phone size={11} /> {client.phone}
                              </span>
                            )}
                            {client.email && (
                              <span className="flex items-center gap-1 text-gray-500 text-xs">
                                <Mail size={11} /> {client.email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
                            <StatusIcon size={12} /> {status.label}
                          </span>
                        </td>
                        <td className="p-3 pr-4">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => toggleStatus(client)}
                              title={client.service_status === "active" ? "Suspender" : "Activar"}
                              className={`p-1.5 rounded-lg transition-colors ${
                                client.service_status === "active"
                                  ? "text-gray-500 hover:text-red-400 hover:bg-red-400/10"
                                  : "text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10"
                              }`}
                            >
                              <Power size={14} />
                            </button>
                            <button
                              onClick={() => openEdit(client)}
                              title="Editar"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-wuipi-accent hover:bg-wuipi-accent/10 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(client.id)}
                              title="Eliminar"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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

      {/* ============================================ */}
      {/* CREATE / EDIT MODAL */}
      {/* ============================================ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-wuipi-sidebar border border-wuipi-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-wuipi-border shrink-0">
              <h2 className="text-lg font-bold text-white">
                {editingClient ? `Editar: ${editingClient.legal_name}` : "Nuevo Cliente"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Body - Scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Identity */}
              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText size={12} /> Identificación
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Razón Social *" value={form.legal_name} onChange={v => setField("legal_name", v)} placeholder="Nombre completo o empresa" />
                  <FormInput label="Nombre Comercial" value={form.trade_name} onChange={v => setField("trade_name", v)} placeholder="Nombre corto (opcional)" />
                  <div className="grid grid-cols-3 gap-2 col-span-2">
                    <FormSelect label="Tipo Doc" value={form.document_type} onChange={v => setField("document_type", v)} options={DOC_TYPES} />
                    <div className="col-span-2">
                      <FormInput label="Nro Documento *" value={form.document_number} onChange={v => setField("document_number", v)} placeholder="12345678 o J-12345678-0" />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* Contact */}
              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Phone size={12} /> Contacto
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <FormInput label="Email" type="email" value={form.email} onChange={v => setField("email", v)} placeholder="correo@ejemplo.com" />
                  <FormInput label="Teléfono" value={form.phone} onChange={v => setField("phone", v)} placeholder="+58 412-1234567" />
                  <FormInput label="Teléfono Alt." value={form.phone_alt} onChange={v => setField("phone_alt", v)} placeholder="Opcional" />
                  <FormInput label="Persona Contacto" value={form.contact_person} onChange={v => setField("contact_person", v)} placeholder="Nombre del contacto" />
                </div>
              </fieldset>

              {/* Address */}
              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <MapPin size={12} /> Ubicación
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FormInput label="Dirección" value={form.address} onChange={v => setField("address", v)} placeholder="Dirección completa" />
                  </div>
                  <FormInput label="Ciudad" value={form.city} onChange={v => setField("city", v)} placeholder="Lechería, Barcelona..." />
                  <FormInput label="Estado" value={form.state} onChange={v => setField("state", v)} placeholder="Anzoátegui" />
                  <FormInput label="Sector / Urbanización" value={form.sector} onChange={v => setField("sector", v)} placeholder="Sector o urbanización" />
                  <FormInput label="Nodo" value={form.nodo} onChange={v => setField("nodo", v)} placeholder="Lechería-Norte, etc." />
                </div>
              </fieldset>

              {/* Service */}
              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Wifi size={12} /> Servicio
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <FormSelect
                    label="Plan"
                    value={form.plan_id}
                    onChange={v => setField("plan_id", v)}
                    options={[
                      { value: "", label: "Sin plan asignado" },
                      ...plans.map(p => ({ value: p.id, label: `${p.name} — $${p.price_usd}/mes` })),
                    ]}
                  />
                  <FormSelect
                    label="Estado del servicio"
                    value={form.service_status}
                    onChange={v => setField("service_status", v)}
                    options={[
                      { value: "active", label: "Activo" },
                      { value: "suspended", label: "Suspendido" },
                      { value: "pending", label: "Pendiente instalación" },
                      { value: "cancelled", label: "Cancelado" },
                    ]}
                  />
                  <FormInput label="Fecha de Instalación" type="date" value={form.installation_date} onChange={v => setField("installation_date", v)} />
                </div>
              </fieldset>

              {/* Billing */}
              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <CreditCard size={12} /> Facturación
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <FormSelect
                    label="Moneda de facturación"
                    value={form.billing_currency}
                    onChange={v => setField("billing_currency", v)}
                    options={[
                      { value: "USD", label: "USD — Dólares" },
                      { value: "VES", label: "VES — Bolívares" },
                    ]}
                  />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Día de facturación</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={form.billing_day}
                      onChange={e => setField("billing_day", parseInt(e.target.value) || 1)}
                      className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Notes */}
              <fieldset>
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Notas</legend>
                <textarea
                  value={form.notes}
                  onChange={e => setField("notes", e.target.value)}
                  rows={3}
                  placeholder="Notas internas sobre el cliente..."
                  className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent/50 resize-none"
                />
              </fieldset>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-wuipi-border shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-wuipi-accent text-black px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-wuipi-accent/90 transition-colors disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? "Guardando..." : editingClient ? "Guardar Cambios" : "Crear Cliente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* DELETE CONFIRMATION */}
      {/* ============================================ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-wuipi-sidebar border border-wuipi-border rounded-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">¿Eliminar cliente?</h3>
            <p className="text-sm text-gray-400 text-center mb-6">
              El cliente será marcado como eliminado. Esta acción se puede revertir desde la base de datos.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-wuipi-border rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 font-semibold hover:bg-red-500/20 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// FORM COMPONENTS
// ============================================
function FormInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent/50"
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
