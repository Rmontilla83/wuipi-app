"use client";

import { useState, useEffect } from "react";
import { X, Save, Search } from "lucide-react";

interface Collector { id: string; full_name: string; type: string; }
interface ClientOption { id: string; code: string; legal_name: string; phone: string | null; email: string | null; service_status: string; plans?: { name: string } | null; }

interface CollectionForm {
  client_id: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  collector_id: string;
  amount_due: string;
  currency: string;
  days_overdue: string;
  months_overdue: string;
  plan_name: string;
  last_payment_date: string;
  notes: string;
}

export const EMPTY_COLLECTION_FORM: CollectionForm = {
  client_id: "", client_name: "", client_phone: "", client_email: "",
  collector_id: "", amount_due: "", currency: "USD",
  days_overdue: "", months_overdue: "", plan_name: "",
  last_payment_date: "", notes: "",
};

export default function CreateCollectionModal({ form, setField, collectors, error, saving, onSave, onClose }: {
  form: CollectionForm;
  setField: (k: string, v: any) => void;
  collectors: Collector[];
  error: string;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (clientSearch.length < 2) { setClients([]); return; }
    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/clients?search=${encodeURIComponent(clientSearch)}&limit=10`);
        const json = await res.json();
        setClients(json.data || []);
        setShowDropdown(true);
      } catch { setClients([]); }
      finally { setSearchLoading(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [clientSearch]);

  const selectClient = (client: ClientOption) => {
    setField("client_id", client.id);
    setField("client_name", client.legal_name);
    setField("client_phone", client.phone || "");
    setField("client_email", client.email || "");
    setField("plan_name", client.plans?.name || "");
    setClientSearch(client.legal_name);
    setShowDropdown(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">Nuevo Caso de Cobranza</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}

          {/* Client selector */}
          <div className="relative">
            <label className="text-xs text-gray-500 mb-1 block">Cliente *</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={clientSearch} onChange={e => { setClientSearch(e.target.value); setField("client_id", ""); }}
                placeholder="Buscar cliente por nombre o código..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-amber-400/50 focus:outline-none" />
            </div>
            {form.client_id && (
              <p className="text-[10px] text-emerald-400 mt-1">Cliente seleccionado: {form.client_name}</p>
            )}
            {showDropdown && clients.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-wuipi-card border border-wuipi-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {clients.map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="w-full text-left px-3 py-2 hover:bg-wuipi-card-hover transition-colors border-b border-wuipi-border/30 last:border-0">
                    <p className="text-xs text-white font-medium">{c.legal_name}</p>
                    <p className="text-[10px] text-gray-500">{c.code} — {c.service_status} {c.phone ? `— ${c.phone}` : ""}</p>
                  </button>
                ))}
              </div>
            )}
            {searchLoading && <p className="text-[10px] text-gray-500 mt-1">Buscando...</p>}
          </div>

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Monto en Mora (USD)</label>
              <input type="number" value={form.amount_due} onChange={e => setField("amount_due", e.target.value)} placeholder="0.00" min="0" step="0.01"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Moneda</label>
              <select value={form.currency} onChange={e => setField("currency", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="USD">USD</option>
                <option value="VES">VES</option>
              </select>
            </div>
          </div>

          {/* Collector */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cobrador</label>
            <select value={form.collector_id} onChange={e => setField("collector_id", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
              <option value="">Sin asignar</option>
              {collectors.map(c => (
                <option key={c.id} value={c.id}>{c.full_name} {c.type === "external" ? "(Externo)" : ""}</option>
              ))}
            </select>
          </div>

          {/* Days / Months overdue */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Días en Mora</label>
              <input type="number" value={form.days_overdue} onChange={e => setField("days_overdue", e.target.value)} placeholder="0" min="0"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Meses en Mora</label>
              <input type="number" value={form.months_overdue} onChange={e => setField("months_overdue", e.target.value)} placeholder="0" min="0"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>

          {/* Last payment + Plan */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Último Pago</label>
              <input type="date" value={form.last_payment_date} onChange={e => setField("last_payment_date", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Plan</label>
              <input value={form.plan_name} onChange={e => setField("plan_name", e.target.value)} placeholder="Nombre del plan"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notas</label>
            <textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} placeholder="Notas adicionales..."
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-wuipi-card border-t border-wuipi-border p-4 flex justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white transition-colors">Cancelar</button>
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-500/90 disabled:opacity-50">
            <Save size={14} /> {saving ? "Guardando..." : "Crear Caso"}
          </button>
        </div>
      </div>
    </div>
  );
}
