"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import {
  Plus, Search, RefreshCw, Upload, Send, Download,
  CheckCircle2, Clock, AlertCircle, FileSpreadsheet, ExternalLink,
  ChevronLeft, RotateCcw, Calendar,
} from "lucide-react";
import * as XLSX from "xlsx";

// ---------- Types ----------

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  total_items: number;
  total_amount_usd: number;
  items_paid: number;
  amount_collected_usd: number;
  status: string;
  created_at: string;
}

interface CampaignItem {
  id: string;
  payment_token: string;
  customer_name: string;
  customer_cedula_rif: string;
  customer_email: string | null;
  customer_phone: string | null;
  invoice_number: string | null;
  concept: string | null;
  amount_usd: number;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
}

interface UploadRow {
  nombre_cliente: string;
  cedula_rif: string;
  email: string;
  telefono: string;
  monto_usd: number;
  concepto: string;
  numero_factura: string;
  // Odoo info fields
  fecha: string;
  subtotal: number;
  impuesto: number;
  total: number;
}

const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

const fmtUSD = (n: number) =>
  `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Borrador", color: "text-gray-400 bg-gray-400/10", icon: Clock },
  sending: { label: "Enviando", color: "text-blue-400 bg-blue-400/10", icon: Send },
  active: { label: "Activa", color: "text-amber-400 bg-amber-400/10", icon: AlertCircle },
  completed: { label: "Completada", color: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },
  cancelled: { label: "Cancelada", color: "text-red-400 bg-red-400/10", icon: AlertCircle },
};

const itemStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "text-gray-400 bg-gray-400/10" },
  sent: { label: "Enviado", color: "text-blue-400 bg-blue-400/10" },
  viewed: { label: "Visto", color: "text-purple-400 bg-purple-400/10" },
  paid: { label: "Pagado", color: "text-emerald-400 bg-emerald-400/10" },
  failed: { label: "Fallido", color: "text-red-400 bg-red-400/10" },
  expired: { label: "Expirado", color: "text-orange-400 bg-orange-400/10" },
  conciliating: { label: "Conciliando", color: "text-yellow-400 bg-yellow-400/10" },
};

// ---------- Cutoff indicator ----------
const CUTOFF_DAY = 8;

function getCutoffInfo(): { daysLeft: number; label: string; color: string; bgColor: string } {
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Calculate next cutoff date
  let cutoffDate: Date;
  if (currentDay <= CUTOFF_DAY) {
    cutoffDate = new Date(currentYear, currentMonth, CUTOFF_DAY);
  } else {
    cutoffDate = new Date(currentYear, currentMonth + 1, CUTOFF_DAY);
  }

  const diffMs = cutoffDate.getTime() - today.getTime();
  const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  let color: string;
  let bgColor: string;
  if (daysLeft > 5) {
    color = "text-emerald-400";
    bgColor = "bg-emerald-400/10 border-emerald-400/20";
  } else if (daysLeft >= 3) {
    color = "text-amber-400";
    bgColor = "bg-amber-400/10 border-amber-400/20";
  } else {
    color = "text-red-400";
    bgColor = "bg-red-400/10 border-red-400/20";
  }

  const label = daysLeft === 0
    ? "Hoy es día de corte"
    : daysLeft === 1
    ? "Falta 1 día para el corte"
    : `Faltan ${daysLeft} días para el corte`;

  return { daysLeft, label, color, bgColor };
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedItems, setSelectedItems] = useState<CampaignItem[]>([]);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/cobranzas/campaigns");
      const json = await res.json();
      setCampaigns(json.campaigns || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const openCampaign = async (campaign: Campaign) => {
    try {
      const res = await fetch(`/api/cobranzas/campaigns?id=${campaign.id}`);
      const json = await res.json();
      setSelectedCampaign(json.campaign);
      setSelectedItems(json.items || []);
      setView("detail");
    } catch (err) {
      console.error(err);
    }
  };

  if (view === "create") {
    return (
      <CreateCampaignView
        onBack={() => setView("list")}
        onCreated={(campaign) => {
          fetchCampaigns();
          setSelectedCampaign(campaign);
          setView("detail");
        }}
      />
    );
  }

  if (view === "detail" && selectedCampaign) {
    return (
      <CampaignDetailView
        campaign={selectedCampaign}
        items={selectedItems}
        onBack={() => {
          setView("list");
          fetchCampaigns();
        }}
        onRefresh={() => openCampaign(selectedCampaign)}
      />
    );
  }

  // ---- Campaign list ----
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Campañas de Cobro</h3>
          <p className="text-sm text-gray-500">Envía cobros masivos por WhatsApp y email</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchCampaigns}
            className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setView("create")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90 transition-colors"
          >
            <Plus size={16} /> Nueva campaña
          </button>
        </div>
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="text-center py-12">
          <FileSpreadsheet size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-sm mb-1">No hay campañas de cobro</p>
          <p className="text-gray-600 text-xs">
            Crea tu primera campaña cargando un archivo Excel
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => {
            const st = statusConfig[c.status] || statusConfig.draft;
            const Icon = st.icon;
            const pct =
              c.total_items > 0 ? Math.round((c.items_paid / c.total_items) * 100) : 0;
            return (
              <Card
                key={c.id}
                className="!p-4 cursor-pointer hover:border-[#F46800]/30 transition-colors"
                onClick={() => openCampaign(c)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-medium truncate">{c.name}</h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}
                      >
                        <Icon size={10} className="inline mr-1" />
                        {st.label}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-gray-500 text-xs truncate">{c.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{c.total_items} clientes</span>
                      <span>Total: {fmtUSD(c.total_amount_usd)}</span>
                      <span className="text-emerald-400">
                        Cobrado: {fmtUSD(c.amount_collected_usd)}
                      </span>
                      <span>
                        {new Date(c.created_at).toLocaleDateString("es-VE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4">
                    {/* Progress ring */}
                    <div className="relative w-12 h-12">
                      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                        <circle
                          cx="22"
                          cy="22"
                          r="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          className="text-wuipi-border"
                        />
                        <circle
                          cx="22"
                          cy="22"
                          r="18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeDasharray={`${(pct / 100) * 113} 113`}
                          strokeLinecap="round"
                          className="text-emerald-400"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// CREATE CAMPAIGN VIEW
// ============================================
function CreateCampaignView({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (campaign: Campaign) => void;
}) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Odoo phone normalizer: "58 412-9441604" → "04129441604" ---
  const normalizePhone = (raw: unknown): string => {
    if (!raw || raw === "NaN" || raw === "nan") return "";
    let s = String(raw).replace(/[\t\n\r]/g, "").trim();
    // Remove +, spaces, dashes
    s = s.replace(/[+\s\-()]/g, "");
    // "58412..." → "0412..."
    if (s.startsWith("58") && s.length >= 12) {
      s = "0" + s.slice(2);
    }
    return s;
  };

  // --- Odoo cédula normalizer: detect V/J prefix by length ---
  const normalizeCedula = (raw: unknown): string => {
    if (!raw || raw === "NaN" || raw === "nan") return "";
    const s = String(raw).replace(/[\t\n\r\s]/g, "").trim();
    // Already has prefix
    if (/^[VJEGP]-?/i.test(s)) return s.toUpperCase();
    // Strip non-alphanumeric
    const digits = s.replace(/\D/g, "");
    if (!digits) return s;
    // >8 digits → RIF jurídico (J), <=8 → cédula natural (V)
    const prefix = digits.length > 8 ? "J" : "V";
    return `${prefix}${digits}`;
  };

  // --- Clean email: remove tabs/newlines ---
  const cleanEmail = (raw: unknown): string => {
    if (!raw || raw === "NaN" || raw === "nan" || raw === "False" || raw === false) return "";
    return String(raw).replace(/[\t\n\r\s]+/g, "").trim();
  };

  // --- Safe string: handle NaN/null/undefined ---
  const safeStr = (raw: unknown): string => {
    if (raw === null || raw === undefined || raw === "NaN" || raw === "nan" || raw === "NaT" || Number.isNaN(raw)) return "";
    return String(raw).trim();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

        const parsed: UploadRow[] = [];
        const errs: string[] = [];
        let skippedZero = 0;

        // Detect format: Odoo columns vs legacy columns
        const firstRow = jsonRows[0] || {};
        const isOdoo = "Adeudado en Divisa" in firstRow || "Nombre del contacto a mostrar en la factura" in firstRow;

        jsonRows.forEach((row, idx) => {
          let nombre = "";
          let cedula = "";
          let email = "";
          let telefono = "";
          let monto = 0;
          let concepto = "";
          let factura = "";
          let fecha = "";
          let subtotal = 0;
          let impuesto = 0;
          let total = 0;

          if (isOdoo) {
            // --- Odoo format ---
            nombre = safeStr(row["Nombre del contacto a mostrar en la factura"]);
            cedula = normalizeCedula(row["Contacto/Número de Identificación"]);
            email = cleanEmail(row["Contacto/Correo electrónico"]);
            telefono = normalizePhone(row["Contacto/Celular"]);
            monto = parseFloat(String(row["Adeudado en Divisa"] || "0")) || 0;
            factura = safeStr(row["Número"]);
            fecha = safeStr(row["Fecha"]);
            subtotal = parseFloat(String(row["Subtotal"] || "0")) || 0;
            impuesto = parseFloat(String(row["Impuesto"] || "0")) || 0;
            total = parseFloat(String(row["Total"] || "0")) || 0;

            // Filter out fully paid invoices (adeudado = 0)
            if (monto <= 0) {
              skippedZero++;
              return;
            }

            // Auto-generate invoice number if NaN/missing
            if (!factura) {
              factura = `AUTO-${idx + 1}`;
            }

            // Build concepto from factura + fecha
            concepto = factura ? `Factura ${factura}` : "Servicio WUIPI";
            if (fecha) concepto += ` — ${fecha}`;
          } else {
            // --- Legacy format ---
            nombre = safeStr(row.nombre_cliente || row.cliente || row.nombre);
            cedula = safeStr(row.cedula_rif || row.cedula || row.rif);
            email = cleanEmail(row.email || row.correo);
            telefono = safeStr(row.telefono || row.phone || row.celular);
            monto = parseFloat(String(row.monto_usd || row.monto || row.amount || "0"));
            concepto = safeStr(row.concepto || row.concept);
            factura = safeStr(row.numero_factura || row.factura || row.invoice);
          }

          if (!nombre) errs.push(`Fila ${idx + 2}: nombre vacío`);
          if (!cedula) errs.push(`Fila ${idx + 2}: cédula/RIF vacío`);
          if (!monto || monto <= 0) errs.push(`Fila ${idx + 2}: monto inválido`);

          parsed.push({
            nombre_cliente: nombre,
            cedula_rif: cedula,
            email,
            telefono,
            monto_usd: monto,
            concepto,
            numero_factura: factura,
            fecha,
            subtotal,
            impuesto,
            total,
          });
        });

        if (skippedZero > 0) {
          errs.unshift(`${skippedZero} fila(s) omitida(s) por tener adeudado $0.00 (ya pagadas)`);
        }

        setRows(parsed);
        setErrors(errs);

        if (!campaignName && file.name) {
          setCampaignName(file.name.replace(/\.\w+$/, "").replace(/[_-]/g, " "));
        }
        setStep("preview");
      } catch {
        setErrors(["Error al leer el archivo. Asegúrese de que sea un archivo Excel válido."]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const updateRow = (idx: number, field: keyof UploadRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!campaignName.trim()) {
      setErrors(["El nombre de la campaña es obligatorio"]);
      return;
    }
    if (rows.length === 0) {
      setErrors(["No hay registros para enviar"]);
      return;
    }

    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch("/api/cobranzas/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_name: campaignName,
          description: description || null,
          rows,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al crear campaña");
      onCreated(json.campaign);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setErrors([msg]);
    } finally {
      setSaving(false);
    }
  };

  const totalUsd = rows.reduce((s, r) => s + (r.monto_usd || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <div>
          <h3 className="text-lg font-semibold text-white">Nueva Campaña de Cobro</h3>
          <p className="text-sm text-gray-500">
            {step === "upload" ? "Carga un archivo Excel con los datos" : "Revisa y confirma"}
          </p>
        </div>
      </div>

      {/* Campaign name */}
      <Card className="!p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Nombre de la campaña *</label>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Ej: Cobro Marzo 2026"
            className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Descripción (opcional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Facturas del mes de marzo"
            className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none"
          />
        </div>
      </Card>

      {step === "upload" && (
        <Card className="!p-8 text-center border-dashed border-2 border-wuipi-border hover:border-[#F46800]/30 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Upload size={40} className="mx-auto mb-3 text-gray-500" />
          <p className="text-white font-medium mb-1">Arrastra tu archivo Excel aquí</p>
          <p className="text-gray-500 text-xs mb-4">
            Compatible con exportación de Odoo 18 (Adeudado en Divisa, Contacto/Celular, etc.)
            <br />
            También acepta formato libre: nombre_cliente, cedula_rif, email, telefono, monto_usd
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2 rounded-lg bg-[#03318C] text-white text-sm font-medium hover:bg-[#03318C]/80 transition-colors"
          >
            <FileSpreadsheet size={14} className="inline mr-2" />
            Seleccionar archivo
          </button>
        </Card>
      )}

      {step === "preview" && rows.length > 0 && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="!p-3 text-center">
              <p className="text-xs text-gray-500">Clientes</p>
              <p className="text-xl font-bold text-white">{rows.length}</p>
            </Card>
            <Card className="!p-3 text-center">
              <p className="text-xs text-gray-500">Total USD</p>
              <p className="text-xl font-bold text-emerald-400">{fmtUSD(totalUsd)}</p>
            </Card>
            <Card className="!p-3 text-center">
              <p className="text-xs text-gray-500">Promedio</p>
              <p className="text-xl font-bold text-amber-400">
                {fmtUSD(rows.length > 0 ? totalUsd / rows.length : 0)}
              </p>
            </Card>
          </div>

          {/* Editable table */}
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-wuipi-card z-10">
                  <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                    <th className="text-left p-2 pl-3 font-medium w-8">#</th>
                    <th className="text-left p-2 font-medium">Cliente</th>
                    <th className="text-left p-2 font-medium">Cédula/RIF</th>
                    <th className="text-left p-2 font-medium">Teléfono</th>
                    <th className="text-left p-2 font-medium">Email</th>
                    <th className="text-left p-2 font-medium">Factura</th>
                    <th className="text-right p-2 font-medium text-gray-600">Total</th>
                    <th className="text-right p-2 font-medium">Adeudado</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover"
                    >
                      <td className="p-2 pl-3 text-gray-500 text-xs">{idx + 1}</td>
                      <td className="p-2">
                        <input
                          value={row.nombre_cliente}
                          onChange={(e) => updateRow(idx, "nombre_cliente", e.target.value)}
                          className="w-full bg-transparent text-white text-xs border-b border-transparent hover:border-wuipi-border focus:border-[#F46800] focus:outline-none px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={row.cedula_rif}
                          onChange={(e) => updateRow(idx, "cedula_rif", e.target.value)}
                          className="w-28 bg-transparent text-gray-300 text-xs font-mono border-b border-transparent hover:border-wuipi-border focus:border-[#F46800] focus:outline-none px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={row.telefono}
                          onChange={(e) => updateRow(idx, "telefono", e.target.value)}
                          className="w-28 bg-transparent text-gray-300 text-xs font-mono border-b border-transparent hover:border-wuipi-border focus:border-[#F46800] focus:outline-none px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={row.email}
                          onChange={(e) => updateRow(idx, "email", e.target.value)}
                          className="w-full bg-transparent text-gray-300 text-xs border-b border-transparent hover:border-wuipi-border focus:border-[#F46800] focus:outline-none px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          value={row.numero_factura}
                          onChange={(e) => updateRow(idx, "numero_factura", e.target.value)}
                          className="w-24 bg-transparent text-gray-300 text-xs font-mono border-b border-transparent hover:border-wuipi-border focus:border-[#F46800] focus:outline-none px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2 text-right text-gray-600 text-xs">
                        {row.total > 0 ? `$${row.total.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          value={row.monto_usd}
                          onChange={(e) =>
                            updateRow(idx, "monto_usd", parseFloat(e.target.value) || 0)
                          }
                          className="w-20 bg-transparent text-emerald-400 text-xs text-right font-bold border-b border-transparent hover:border-wuipi-border focus:border-[#F46800] focus:outline-none px-1 py-0.5"
                        />
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => removeRow(idx)}
                          className="text-red-400/50 hover:text-red-400 text-xs"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setStep("upload");
                setRows([]);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white transition-colors"
            >
              <RotateCcw size={14} /> Cargar otro archivo
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              Crear campaña ({rows.length} clientes)
            </button>
          </div>
        </>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="!p-3 border-red-500/30 bg-red-500/5">
          <p className="text-red-400 text-xs font-medium mb-1">
            <AlertCircle size={12} className="inline mr-1" />
            Errores encontrados:
          </p>
          <ul className="text-red-300 text-xs space-y-0.5">
            {errors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {errors.length > 10 && (
              <li className="text-gray-500">...y {errors.length - 10} más</li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ============================================
// CAMPAIGN DETAIL VIEW
// ============================================
function CampaignDetailView({
  campaign,
  items,
  onBack,
  onRefresh,
}: {
  campaign: Campaign;
  items: CampaignItem[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sendResults, setSendResults] = useState<any>(null);

  const st = statusConfig[campaign.status] || statusConfig.draft;
  const pct =
    campaign.total_items > 0
      ? Math.round((campaign.items_paid / campaign.total_items) * 100)
      : 0;

  const filteredItems = items.filter((item) => {
    if (filterStatus !== "all" && item.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.customer_name.toLowerCase().includes(q) ||
        item.customer_cedula_rif.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSend = async () => {
    if (!confirm("¿Enviar cobros por WhatsApp y Email a todos los clientes pendientes?")) return;
    setSending(true);
    setMessage("");
    setSendResults(null);
    try {
      const res = await fetch("/api/cobranzas/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setMessage(`Enviados: ${json.sent} | Fallidos: ${json.failed}`);
      setSendResults(json);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setMessage(`Error: ${msg}`);
    } finally {
      setSending(false);
    }
  };

  const handleRemind = async () => {
    if (!confirm("¿Enviar recordatorios a clientes que no han pagado?")) return;
    setReminding(true);
    setMessage("");
    try {
      const res = await fetch("/api/cobranzas/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setMessage(`Recordatorios: ${json.reminded} | Omitidos: ${json.skipped}`);
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setMessage(`Error: ${msg}`);
    } finally {
      setReminding(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/cobranzas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cobranzas-${campaign.name.replace(/\s+/g, "-")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      setMessage(`Error: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{campaign.name}</h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}
              >
                {st.label}
              </span>
            </div>
            {campaign.description && (
              <p className="text-sm text-gray-500">{campaign.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === "draft" && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#03318C] text-white text-sm font-medium hover:bg-[#03318C]/80 transition-colors disabled:opacity-50"
            >
              {sending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Enviar cobros
            </button>
          )}
          {campaign.status === "active" && (
            <button
              onClick={handleRemind}
              disabled={reminding}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-500/90 transition-colors disabled:opacity-50"
            >
              {reminding ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              Recordatorios
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-wuipi-border text-gray-300 text-sm hover:text-white transition-colors disabled:opacity-50"
          >
            <Download size={14} /> Exportar Odoo
          </button>
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <Card className="!p-3 border-blue-500/30 bg-blue-500/5">
          <p className="text-blue-300 text-xs">{message}</p>
        </Card>
      )}

      {/* Send results detail panel */}
      {sendResults && (
        <Card className="!p-0 border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/20">
            <p className="text-amber-300 text-xs font-semibold">
              Resultado del envío — {sendResults.sent} enviados, {sendResults.failed} fallidos
            </p>
            <button
              onClick={() => setSendResults(null)}
              className="text-gray-500 hover:text-white text-xs"
            >
              Cerrar
            </button>
          </div>

          {/* Env vars */}
          {sendResults.env && (
            <div className="px-4 py-2 border-b border-amber-500/10 bg-black/20">
              <p className="text-[10px] text-gray-500 font-mono">
                WA_PHONE_ID: {sendResults.env.WHATSAPP_PHONE_NUMBER_ID} |
                WA_TOKEN: {sendResults.env.WHATSAPP_ACCESS_TOKEN} |
                WA_LANG: {sendResults.env.WHATSAPP_TEMPLATE_LANG} |
                RESEND: {sendResults.env.RESEND_API_KEY} |
                URL: {sendResults.env.APP_URL}
              </p>
            </div>
          )}

          {/* Per-item results */}
          <div className="max-h-[400px] overflow-y-auto">
            {sendResults.results?.map((r: {
              name: string;
              phone: string | null;
              email: string | null;
              whatsapp: { ok: boolean; status: number | string; normalizedPhone?: string; template?: string; lang?: string; response: unknown; fallback?: unknown } | null;
              email_result: { status: string; error?: string } | null;
            }, i: number) => (
              <div key={i} className="px-4 py-2 border-b border-wuipi-border/30 text-xs">
                <p className="text-white font-medium">{r.name}</p>

                {/* WhatsApp */}
                <div className="mt-1 flex items-start gap-2">
                  <span className={`font-semibold shrink-0 ${r.whatsapp?.ok ? "text-emerald-400" : "text-red-400"}`}>
                    WA {r.whatsapp?.ok ? "OK" : "FAIL"}
                  </span>
                  <span className="text-gray-400 font-mono break-all">
                    phone={r.phone} → {r.whatsapp?.normalizedPhone || "?"} |
                    tpl={r.whatsapp?.template || "?"} lang={r.whatsapp?.lang || "?"} |
                    status={String(r.whatsapp?.status || "?")}
                  </span>
                </div>
                <pre className="mt-0.5 text-[10px] text-gray-500 font-mono bg-black/20 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24"
                  dangerouslySetInnerHTML={{ __html: JSON.stringify(r.whatsapp?.response ?? null, null, 2) }}
                />
                {r.whatsapp?.fallback ? (
                  <pre className="mt-0.5 text-[10px] text-amber-500/80 font-mono bg-black/20 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-24"
                    dangerouslySetInnerHTML={{ __html: "FALLBACK: " + JSON.stringify(r.whatsapp.fallback, null, 2) }}
                  />
                ) : null}

                {/* Email */}
                <div className="mt-1 flex items-center gap-2">
                  <span className={`font-semibold ${r.email_result?.status === "sent" ? "text-emerald-400" : r.email_result?.status === "skipped" ? "text-gray-500" : "text-red-400"}`}>
                    Email {r.email_result?.status || "?"}
                  </span>
                  {r.email_result?.error && (
                    <span className="text-red-300 font-mono">{r.email_result.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Cutoff indicator */}
      {(() => {
        const cutoff = getCutoffInfo();
        return (
          <Card className={`!p-3 border ${cutoff.bgColor} flex items-center gap-3`}>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${cutoff.bgColor}`}>
              <Calendar size={16} className={cutoff.color} />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${cutoff.color}`}>{cutoff.label}</p>
              <p className="text-xs text-gray-500">Fecha de corte: día {CUTOFF_DAY} de cada mes</p>
            </div>
            <div className={`text-2xl font-bold ${cutoff.color}`}>{cutoff.daysLeft}</div>
          </Card>
        );
      })()}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-xl font-bold text-white">{campaign.total_items}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Pagados</p>
          <p className="text-xl font-bold text-emerald-400">{campaign.items_paid}</p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Pendientes</p>
          <p className="text-xl font-bold text-amber-400">
            {campaign.total_items - campaign.items_paid}
          </p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Cobrado</p>
          <p className="text-xl font-bold text-emerald-400">
            {fmtUSD(campaign.amount_collected_usd)}
          </p>
        </Card>
        <Card className="!p-3 text-center">
          <p className="text-xs text-gray-500">Progreso</p>
          <p className="text-xl font-bold text-[#F46800]">{pct}%</p>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-wuipi-border rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o cédula..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">Estado: Todos</option>
          {Object.entries(itemStatusConfig).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
      </div>

      {/* Items table */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-3 pl-4 font-medium">Cliente</th>
                <th className="text-left p-3 font-medium">Cédula/RIF</th>
                <th className="text-left p-3 font-medium">Concepto</th>
                <th className="text-right p-3 font-medium">Monto USD</th>
                <th className="text-center p-3 font-medium">Estado</th>
                <th className="text-left p-3 font-medium">Método</th>
                <th className="text-left p-3 font-medium">Referencia</th>
                <th className="text-center p-3 pr-4 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const ist = itemStatusConfig[item.status] || itemStatusConfig.pending;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors"
                  >
                    <td className="p-3 pl-4">
                      <p className="text-white font-medium text-xs">
                        {item.customer_name}
                      </p>
                      <p className="text-gray-600 text-[10px]">
                        {item.customer_email || item.customer_phone || ""}
                      </p>
                    </td>
                    <td className="p-3 text-gray-300 text-xs">
                      {item.customer_cedula_rif}
                    </td>
                    <td className="p-3 text-gray-300 text-xs truncate max-w-[200px]">
                      {item.concept || "—"}
                    </td>
                    <td className="p-3 text-right text-xs font-bold text-emerald-400">
                      {fmtUSD(Number(item.amount_usd))}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ist.color}`}
                      >
                        {ist.label}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400 text-xs">
                      {item.payment_method === "debito_inmediato"
                        ? "Débito"
                        : item.payment_method === "transferencia"
                        ? "Transferencia"
                        : item.payment_method === "stripe"
                        ? "Tarjeta USD"
                        : "—"}
                    </td>
                    <td className="p-3 text-gray-400 text-xs font-mono">
                      {item.payment_reference || "—"}
                    </td>
                    <td className="p-3 pr-4 text-center">
                      <a
                        href={`${APP_URL}/pagar/${item.payment_token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#F46800] hover:text-[#F46800]/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
