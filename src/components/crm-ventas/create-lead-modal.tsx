"use client";

import { X, Save } from "lucide-react";

interface Product { id: string; name: string; category: string; base_price: number; }
interface Salesperson { id: string; full_name: string; type: string; }

interface LeadForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  sector: string;
  nodo: string;
  document_type: string;
  document_number: string;
  product_id: string;
  salesperson_id: string;
  source: string;
  value: string;
  notes: string;
}

export const EMPTY_LEAD_FORM: LeadForm = {
  name: "", phone: "", email: "", address: "", city: "", state: "",
  sector: "", nodo: "", document_type: "", document_number: "",
  product_id: "", salesperson_id: "", source: "other", value: "", notes: "",
};

export default function CreateLeadModal({ form, setField, products, salespeople, error, saving, onSave, onClose }: {
  form: LeadForm;
  setField: (k: string, v: any) => void;
  products: Product[];
  salespeople: Salesperson[];
  error: string;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-wuipi-card border-b border-wuipi-border p-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">Nuevo Lead</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{error}</div>}

          {/* Name */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nombre / Empresa *</label>
            <input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Nombre del prospecto"
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none" />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Teléfono</label>
              <input value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="0412-1234567"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input value={form.email} onChange={e => setField("email", e.target.value)} placeholder="email@ejemplo.com"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>

          {/* Document */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo Doc.</label>
              <select value={form.document_type} onChange={e => setField("document_type", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="">Sin documento</option>
                <option value="V">V - Venezolano</option>
                <option value="J">J - Jurídico</option>
                <option value="E">E - Extranjero</option>
                <option value="G">G - Gobierno</option>
                <option value="P">P - Pasaporte</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nro. Documento</label>
              <input value={form.document_number} onChange={e => setField("document_number", e.target.value)} placeholder="12345678"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Dirección</label>
            <input value={form.address} onChange={e => setField("address", e.target.value)} placeholder="Dirección completa"
              className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
          </div>

          {/* City + State + Sector + Nodo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ciudad</label>
              <input value={form.city} onChange={e => setField("city", e.target.value)} placeholder="Ciudad"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Estado</label>
              <input value={form.state} onChange={e => setField("state", e.target.value)} placeholder="Estado"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sector</label>
              <input value={form.sector} onChange={e => setField("sector", e.target.value)} placeholder="Sector"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nodo</label>
              <input value={form.nodo} onChange={e => setField("nodo", e.target.value)} placeholder="Nodo"
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:outline-none" />
            </div>
          </div>

          {/* Product + Salesperson */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Producto</label>
              <select value={form.product_id} onChange={e => setField("product_id", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="">Sin producto</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vendedor</label>
              <select value={form.salesperson_id} onChange={e => setField("salesperson_id", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="">Sin asignar</option>
                {salespeople.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} {s.type === "external" ? "(Aliado)" : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source + Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fuente</label>
              <select value={form.source} onChange={e => setField("source", e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                <option value="whatsapp">WhatsApp</option>
                <option value="web">Web</option>
                <option value="referido">Referido</option>
                <option value="social">Redes Sociales</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Valor (USD)</label>
              <input type="number" value={form.value} onChange={e => setField("value", e.target.value)} placeholder="0.00" min="0" step="0.01"
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:bg-wuipi-accent/90 disabled:opacity-50">
            <Save size={14} /> {saving ? "Guardando..." : "Crear Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
