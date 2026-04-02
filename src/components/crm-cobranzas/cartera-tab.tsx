"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Search, AlertTriangle, Users, DollarSign,
  Clock, CheckSquare, Square, Plus, ChevronDown,
} from "lucide-react";
import type { OdooCustomerBalance, OdooGroupedResponse } from "@/types/odoo";

// ── Helpers ──────────────────────────────────────────────

const fmtBs = (n: number) =>
  `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtUSD = (n: number) =>
  `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtAmount = (n: number, currency: string) =>
  currency === "USD" ? fmtUSD(n) : fmtBs(n);

function daysSince(dateStr: string): number {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

const normalizePhone = (raw: string): string => {
  if (!raw) return "";
  let s = raw.replace(/[+\s\-()]/g, "");
  if (s.startsWith("58") && s.length >= 12) s = "0" + s.slice(2);
  return s;
};

const normalizeCedula = (raw: string): string => {
  if (!raw) return "";
  const s = raw.replace(/[\s]/g, "").trim();
  if (/^[VJEGP]-?/i.test(s)) return s.toUpperCase();
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  const prefix = digits.length > 8 ? "J" : "V";
  return `${prefix}${digits}`;
};

const AGE_FILTERS = [
  { label: "Todos", value: 0 },
  { label: "> 15 días", value: 15 },
  { label: "> 30 días", value: 30 },
  { label: "> 60 días", value: 60 },
];

// ── Component ────────────────────────────────────────────

interface CarteraTabProps {
  onCampaignCreated?: () => void;
}

export default function CarteraTab({ onCampaignCreated }: CarteraTabProps) {
  const [customers, setCustomers] = useState<OdooCustomerBalance[]>([]);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string>("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [minAmount, setMinAmount] = useState(0);
  const [minAge, setMinAge] = useState(0);

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Campaign creation
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchCartera = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/odoo/invoices/grouped");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}`);
      }
      const data: OdooGroupedResponse = await res.json();
      setCustomers(data.customers);
      setTotalDue(data.total_due);
      setSyncedAt(data.synced_at);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al conectar con Odoo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCartera(); }, [fetchCartera]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = customers;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.customer_cedula_rif.toLowerCase().includes(q)
      );
    }
    if (minAmount > 0) {
      result = result.filter((c) => c.total_due >= minAmount);
    }
    if (minAge > 0) {
      result = result.filter((c) => daysSince(c.oldest_due_date) >= minAge);
    }
    return result;
  }, [customers, searchQuery, minAmount, minAge]);

  // KPI computations
  const totalFiltered = filtered.reduce((s, c) => s + c.total_due, 0);
  const over30 = customers.filter((c) => daysSince(c.oldest_due_date) > 30).length;
  const over60 = customers.filter((c) => daysSince(c.oldest_due_date) > 60).length;

  // Selection helpers
  const toggleSelect = (partnerId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(partnerId)) next.delete(partnerId);
      else next.add(partnerId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.odoo_partner_id)));
    }
  };

  const selectedCustomers = filtered.filter((c) => selected.has(c.odoo_partner_id));
  const selectedTotal = selectedCustomers.reduce((s, c) => s + c.total_due, 0);

  // Campaign creation
  const handleCreateCampaign = async () => {
    if (!campaignName.trim()) return;
    setCreating(true);
    try {
      const rows = selectedCustomers.map((c) => ({
        nombre_cliente: c.customer_name,
        cedula_rif: normalizeCedula(c.customer_cedula_rif),
        email: c.customer_email || "",
        telefono: normalizePhone(c.customer_phone),
        monto_usd: c.total_due,
        concepto: c.invoice_count === 1
          ? `Factura ${c.invoices[0].invoice_number}`
          : `Saldo pendiente — ${c.invoice_count} factura(s)`,
        numero_factura: c.invoices.map((i) => i.invoice_number).join(", "),
        fecha: c.oldest_due_date || "",
        subtotal: 0,
        impuesto: 0,
        total: c.total_due,
        metadata: {
          source: "odoo",
          odoo_partner_id: c.odoo_partner_id,
          currency: c.currency,
          odoo_invoices: c.invoices.map((inv) => ({
            id: inv.id,
            number: inv.invoice_number,
            date: inv.invoice_date,
            due_date: inv.due_date,
            total: inv.total,
            amount_due: inv.amount_due,
            currency: inv.currency,
            products: inv.products,
          })),
        },
      }));

      const res = await fetch("/api/cobranzas/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_name: campaignName,
          description: campaignDesc || null,
          rows,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear campaña");

      setShowCreateForm(false);
      setSelected(new Set());
      setCampaignName("");
      setCampaignDesc("");
      onCampaignCreated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  // ── Render ───────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Cartera de Cobro</h3>
          <p className="text-sm text-gray-500">
            {syncedAt ? `Clientes con facturas pendientes — Odoo sincronizado ${new Date(syncedAt).toLocaleTimeString("es-VE")}` : "Cargando datos de Odoo..."}
          </p>
        </div>
        <button
          onClick={fetchCartera}
          disabled={loading}
          className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <Card className="!p-3 border-red-500/30 bg-red-500/5">
          <p className="text-red-400 text-xs"><AlertTriangle size={12} className="inline mr-1" />{error}</p>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="!p-3 text-center">
          <Users size={16} className="mx-auto mb-1 text-gray-500" />
          <p className="text-xs text-gray-500">Clientes con deuda</p>
          <p className="text-xl font-bold text-white">{customers.length}</p>
        </Card>
        <Card className="!p-3 text-center">
          <DollarSign size={16} className="mx-auto mb-1 text-gray-500" />
          <p className="text-xs text-gray-500">Monto pendiente</p>
          <p className="text-xl font-bold text-emerald-400">{fmtBs(totalDue)}</p>
        </Card>
        <Card className="!p-3 text-center">
          <Clock size={16} className="mx-auto mb-1 text-amber-500" />
          <p className="text-xs text-gray-500">&gt; 30 días</p>
          <p className="text-xl font-bold text-amber-400">{over30}</p>
        </Card>
        <Card className="!p-3 text-center">
          <AlertTriangle size={16} className="mx-auto mb-1 text-red-500" />
          <p className="text-xs text-gray-500">&gt; 60 días</p>
          <p className="text-xl font-bold text-red-400">{over60}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="!p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o RIF..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Monto mín:</label>
            <input
              type="number"
              value={minAmount || ""}
              onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-24 px-2 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Antigüedad:</label>
            <div className="relative">
              <select
                value={minAge}
                onChange={(e) => setMinAge(parseInt(e.target.value))}
                className="appearance-none px-3 py-2 pr-8 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-[#F46800]/50 focus:outline-none"
              >
                {AGE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>
          </div>
          <p className="text-xs text-gray-500 ml-auto">
            {filtered.length} de {customers.length} — {fmtBs(totalFiltered)}
          </p>
        </div>
      </Card>

      {/* Selection bar */}
      {selected.size > 0 && (
        <Card className="!p-3 border-[#F46800]/30 bg-[#F46800]/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-white font-medium">
                {selected.size} seleccionado{selected.size > 1 ? "s" : ""} — {fmtBs(selectedTotal)}
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-400 hover:text-white underline"
              >
                Deseleccionar
              </button>
            </div>
            {!showCreateForm ? (
              <button
                onClick={() => {
                  const month = new Date().toLocaleString("es-VE", { month: "long", year: "numeric" });
                  setCampaignName(`Cobro Cartera — ${month}`);
                  setShowCreateForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90 transition-colors"
              >
                <Plus size={14} /> Crear campaña
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Nombre de la campaña"
                  className="px-3 py-1.5 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none w-64"
                />
                <button
                  onClick={handleCreateCampaign}
                  disabled={creating || !campaignName.trim()}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90 transition-colors disabled:opacity-50"
                >
                  {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  Crear ({selected.size})
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
          <span className="ml-3 text-gray-500 text-sm">Consultando Odoo...</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <Users size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400 text-sm">No se encontraron clientes con los filtros aplicados</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-wuipi-card z-10">
                <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                  <th className="p-2 pl-3 w-8">
                    <button onClick={toggleSelectAll} className="text-gray-500 hover:text-white">
                      {selected.size === filtered.length && filtered.length > 0
                        ? <CheckSquare size={14} className="text-[#F46800]" />
                        : <Square size={14} />}
                    </button>
                  </th>
                  <th className="text-left p-2 font-medium">Cliente</th>
                  <th className="text-left p-2 font-medium">RIF</th>
                  <th className="text-right p-2 font-medium">Fact.</th>
                  <th className="text-right p-2 font-medium">Saldo</th>
                  <th className="text-right p-2 font-medium">Días</th>
                  <th className="text-left p-2 font-medium">Productos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const days = daysSince(c.oldest_due_date);
                  const isSelected = selected.has(c.odoo_partner_id);
                  const dayColor = days > 60 ? "text-red-400" : days > 30 ? "text-orange-400" : days > 15 ? "text-amber-400" : "text-gray-400";
                  const allProducts = c.invoices
                    .flatMap((i) => i.products)
                    .map((p) => p.replace(/\[.*?\]\s*/, ""));
                  const uniqueProducts = Array.from(new Set(allProducts));

                  return (
                    <tr
                      key={c.odoo_partner_id}
                      onClick={() => toggleSelect(c.odoo_partner_id)}
                      className={`border-b border-wuipi-border/50 cursor-pointer transition-colors ${
                        isSelected ? "bg-[#F46800]/5" : "hover:bg-wuipi-card-hover"
                      }`}
                    >
                      <td className="p-2 pl-3">
                        {isSelected
                          ? <CheckSquare size={14} className="text-[#F46800]" />
                          : <Square size={14} className="text-gray-600" />}
                      </td>
                      <td className="p-2">
                        <p className="text-white text-xs font-medium truncate max-w-[200px]">{c.customer_name}</p>
                        {c.customer_email && (
                          <p className="text-gray-600 text-[10px] truncate">{c.customer_email}</p>
                        )}
                      </td>
                      <td className="p-2 text-gray-400 text-xs font-mono">{normalizeCedula(c.customer_cedula_rif)}</td>
                      <td className="p-2 text-right text-gray-400 text-xs">{c.invoice_count}</td>
                      <td className="p-2 text-right text-emerald-400 text-xs font-bold">
                        {fmtAmount(c.total_due, c.currency)}
                      </td>
                      <td className={`p-2 text-right text-xs font-medium ${dayColor}`}>{days}d</td>
                      <td className="p-2 text-gray-500 text-[10px] truncate max-w-[180px]">
                        {uniqueProducts.slice(0, 2).join(", ")}
                        {uniqueProducts.length > 2 && ` +${uniqueProducts.length - 2}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
