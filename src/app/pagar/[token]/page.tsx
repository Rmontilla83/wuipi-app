"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Building2,
  CreditCard,
  ArrowRight,
  Shield,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Smartphone,
  Globe,
  Banknote,
} from "lucide-react";

// ---------- Types ----------

interface PaymentData {
  token: string;
  customer_name: string;
  invoice_number: string | null;
  concept: string | null;
  amount_usd: number;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
}

interface BCVData {
  usd_to_bs: number;
  amount_bss: number;
  source: string;
}

type PaymentMethod = "debito_inmediato" | "transferencia" | "stripe";

// ---------- Main Component ----------

export default function PagarPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;

  const [data, setData] = useState<PaymentData | null>(null);
  const [bcv, setBcv] = useState<BCVData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);
  const [transferRef, setTransferRef] = useState("");
  const [confirmingSent, setConfirmingSent] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Check for callback status
  const callbackStatus = searchParams.get("status");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/cobranzas/${token}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setData(json);

      // Fetch BCV rate
      if (json.amount_usd) {
        const bcvRes = await fetch(`/api/cobranzas/bcv?amount=${json.amount_usd}`);
        const bcvJson = await bcvRes.json();
        if (bcvRes.ok) setBcv(bcvJson);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll for payment status after callback
  useEffect(() => {
    if (!callbackStatus || !data || data.status === "paid") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cobranzas/${token}`);
        const json = await res.json();
        if (json.status === "paid") {
          setData(json);
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [callbackStatus, data, token]);

  const handlePay = async (method: PaymentMethod) => {
    setProcessing(true);
    setError("");
    try {
      const res = await fetch("/api/cobranzas/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, method }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");

      if (json.redirect_url) {
        window.location.href = json.redirect_url;
        return; // Don't reset processing — we're navigating away
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar");
    }
    setProcessing(false);
  };

  const handleConfirmTransfer = async () => {
    if (!transferRef.trim()) return;
    setConfirmingSent(true);
    try {
      const res = await fetch("/api/cobranzas/pay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reference: transferRef }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setData((prev) => prev ? { ...prev, status: "conciliating" } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar");
    } finally {
      setConfirmingSent(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  // ---- Loading ----
  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#F46800] animate-spin mb-4" />
          <p className="text-gray-500 text-sm">Cargando datos de pago...</p>
        </div>
      </PageShell>
    );
  }

  // ---- Error ----
  if (error && !data) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-white text-lg font-semibold mb-2">Enlace no válido</h2>
          <p className="text-gray-400 text-sm text-center max-w-sm">{error}</p>
        </div>
      </PageShell>
    );
  }

  if (!data) return null;

  // ---- Already paid ----
  if (data.status === "paid") {
    return (
      <PageShell>
        <PaidConfirmation data={data} />
      </PageShell>
    );
  }

  // ---- Conciliating ----
  if (data.status === "conciliating") {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Verificando transferencia</h2>
          <p className="text-gray-400 text-sm mb-4">
            Tu transferencia está siendo verificada. Recibirás una confirmación por WhatsApp cuando sea procesada.
          </p>
          <p className="text-gray-500 text-xs">
            Referencia: {data.payment_reference}
          </p>
        </div>
      </PageShell>
    );
  }

  // ---- Waiting for callback ----
  if (callbackStatus === "callback" || callbackStatus === "success") {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-12">
          <Loader2 className="w-10 h-10 text-[#F46800] animate-spin mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">Procesando tu pago...</h2>
          <p className="text-gray-400 text-sm">
            Estamos confirmando tu pago. Por favor no cierres esta página.
          </p>
        </div>
      </PageShell>
    );
  }

  const amountBss = bcv?.amount_bss || 0;
  const bcvRate = bcv?.usd_to_bs || 0;

  // ---- Payment selection ----
  return (
    <PageShell>
      <div className="max-w-lg mx-auto">
        {/* Invoice card */}
        <div className="bg-gradient-to-br from-[#060633] to-[#03318C] rounded-2xl p-6 mb-6 shadow-xl">
          <p className="text-blue-200 text-xs mb-1">Cobro para</p>
          <h2 className="text-white text-xl font-bold mb-4">{data.customer_name}</h2>

          <div className="space-y-2 mb-4">
            {data.concept && (
              <div className="flex justify-between items-center">
                <span className="text-blue-200/70 text-sm">Concepto</span>
                <span className="text-white text-sm font-medium">{data.concept}</span>
              </div>
            )}
            {data.invoice_number && (
              <div className="flex justify-between items-center">
                <span className="text-blue-200/70 text-sm">Factura</span>
                <span className="text-white text-sm font-mono">{data.invoice_number}</span>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-4">
            <p className="text-blue-200/60 text-xs mb-1">MONTO A PAGAR</p>
            <div className="flex items-baseline gap-2">
              <span className="text-white text-4xl font-bold tracking-tight">
                ${Number(data.amount_usd).toFixed(2)}
              </span>
              <span className="text-blue-200/60 text-lg">USD</span>
            </div>
            {bcvRate > 0 && (
              <p className="text-blue-200/50 text-xs mt-1">
                = Bs. {amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 })} (Tasa BCV: {bcvRate.toFixed(2)})
              </p>
            )}
          </div>
        </div>

        {/* Payment methods */}
        <h3 className="text-white text-sm font-semibold mb-3">Selecciona tu método de pago</h3>

        <div className="space-y-3 mb-6">
          {/* Débito Inmediato */}
          <PaymentMethodCard
            icon={<Banknote className="w-5 h-5" />}
            title="Débito Inmediato"
            subtitle={`Paga con tu banco en Bs. ${amountBss > 0 ? `(Bs. ${amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 })})` : ""}`}
            description="Débito directo, Tarjeta Débito o Pago Móvil C2P"
            selected={selectedMethod === "debito_inmediato"}
            onClick={() => setSelectedMethod("debito_inmediato")}
            accent="#03318C"
          />

          {/* Transferencia */}
          <PaymentMethodCard
            icon={<Building2 className="w-5 h-5" />}
            title="Transferencia Bancaria"
            subtitle={`Bs. ${amountBss > 0 ? amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 }) : "..."}`}
            description="Transfiere a la cuenta de WUIPI en Mercantil"
            selected={selectedMethod === "transferencia"}
            onClick={() => setSelectedMethod("transferencia")}
            accent="#F46800"
          />

          {/* Stripe */}
          <PaymentMethodCard
            icon={<CreditCard className="w-5 h-5" />}
            title="Tarjeta Internacional"
            subtitle={`$${Number(data.amount_usd).toFixed(2)} USD`}
            description="Visa, Mastercard, American Express"
            selected={selectedMethod === "stripe"}
            onClick={() => setSelectedMethod("stripe")}
            accent="#635BFF"
          />
        </div>

        {/* Action area */}
        {selectedMethod === "transferencia" ? (
          <TransferDetails
            amountBss={amountBss}
            bcvRate={bcvRate}
            concept={data.invoice_number || token}
            transferRef={transferRef}
            setTransferRef={setTransferRef}
            confirming={confirmingSent}
            onConfirm={handleConfirmTransfer}
            copied={copied}
            onCopy={copyToClipboard}
          />
        ) : selectedMethod ? (
          <button
            onClick={() => handlePay(selectedMethod)}
            disabled={processing}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-semibold text-base transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
            style={{
              background:
                selectedMethod === "debito_inmediato"
                  ? "linear-gradient(135deg, #03318C, #060633)"
                  : "linear-gradient(135deg, #635BFF, #4B44D4)",
            }}
          >
            {processing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Pagar ahora
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        ) : null}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-xs text-center">{error}</p>
          </div>
        )}

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 mt-6 text-gray-500">
          <Shield className="w-3.5 h-3.5" />
          <span className="text-xs">Pago seguro y encriptado</span>
        </div>
      </div>
    </PageShell>
  );
}

// ---------- Subcomponents ----------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a1a]">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0a1a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/img/wuipi-logo.webp" alt="WUIPI" className="h-10 max-w-[140px] object-contain" />
            <div className="h-4 w-px bg-white/10" />
            <p className="text-gray-400 text-xs">Portal de pago</p>
          </div>
          <div className="flex items-center gap-1 text-gray-600 text-[10px]">
            <Shield className="w-3 h-3" />
            <span>Pago seguro</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-6">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-auto">
        <div className="max-w-lg mx-auto px-4 py-6 text-center">
          <p className="text-gray-600 text-xs">
            WUIPI Telecomunicaciones — wuipi.net
          </p>
          <p className="text-gray-700 text-[10px] mt-1">
            Soporte: soporte@wuipi.net | +58 412-7195425
          </p>
        </div>
      </footer>
    </div>
  );
}

function PaymentMethodCard({
  icon,
  title,
  subtitle,
  description,
  selected,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
        selected
          ? "border-opacity-100 bg-opacity-5 scale-[1.02] shadow-lg"
          : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
      }`}
      style={{
        borderColor: selected ? accent : undefined,
        backgroundColor: selected ? `${accent}08` : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{
            backgroundColor: selected ? `${accent}15` : "rgba(255,255,255,0.05)",
            color: selected ? accent : "#9ca3af",
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-medium">{title}</span>
            <span className="text-gray-400 text-xs">{subtitle}</span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

function TransferDetails({
  amountBss,
  bcvRate,
  concept,
  transferRef,
  setTransferRef,
  confirming,
  onConfirm,
  copied,
  onCopy,
}: {
  amountBss: number;
  bcvRate: number;
  concept: string;
  transferRef: string;
  setTransferRef: (v: string) => void;
  confirming: boolean;
  onConfirm: () => void;
  copied: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => onCopy(text, field)}
      className="ml-2 text-gray-500 hover:text-white transition-colors"
    >
      {copied === field ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 space-y-3">
        <h4 className="text-white text-sm font-semibold">Datos para transferencia</h4>

        <DetailRow label="Banco" value="Mercantil C.A., Banco Universal" />
        <DetailRow label="Tipo" value="Cuenta Corriente" />
        <DetailRow
          label="Cuenta"
          value="0105 0287 05 1287005713"
          extra={<CopyBtn text="01050287051287005713" field="cuenta" />}
          mono
        />
        <DetailRow
          label="RIF"
          value="J-41156771-0"
          extra={<CopyBtn text="J-41156771-0" field="rif" />}
        />
        <DetailRow label="Razón Social" value="WUIPI TECH, C.A." />
        <DetailRow
          label="Pago Móvil"
          value="04248803917"
          extra={<CopyBtn text="04248803917" field="movil" />}
        />

        <div className="border-t border-white/5 pt-3">
          <DetailRow
            label="Concepto"
            value={concept}
            extra={<CopyBtn text={concept} field="concepto" />}
            mono
          />
          <DetailRow
            label="Monto Bs."
            value={`Bs. ${amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`}
            extra={<CopyBtn text={amountBss.toFixed(2)} field="monto" />}
            highlight
          />
          <p className="text-gray-600 text-[10px] mt-1">
            Tasa BCV: {bcvRate.toFixed(2)} Bs/$
          </p>
        </div>
      </div>

      {/* Confirm transfer */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 space-y-3">
        <h4 className="text-white text-sm font-semibold">¿Ya realizaste la transferencia?</h4>
        <input
          value={transferRef}
          onChange={(e) => setTransferRef(e.target.value)}
          placeholder="Número de referencia"
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none"
        />
        <button
          onClick={onConfirm}
          disabled={confirming || !transferRef.trim()}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F46800] to-[#ff8534] text-white font-semibold text-sm transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        >
          {confirming ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            "Confirmar transferencia"
          )}
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  extra,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 text-xs">{label}</span>
      <div className="flex items-center">
        <span
          className={`text-xs ${highlight ? "text-[#F46800] font-bold text-sm" : "text-white"} ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {extra}
      </div>
    </div>
  );
}

function PaidConfirmation({ data }: { data: PaymentData }) {
  return (
    <div className="max-w-md mx-auto text-center py-8">
      {/* Animated check */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
        <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
      </div>

      <h2 className="text-white text-2xl font-bold mb-2">¡Pago recibido!</h2>
      <p className="text-gray-400 text-sm mb-6">
        Tu pago ha sido procesado exitosamente
      </p>

      {/* Receipt card */}
      <div className="bg-white/[0.03] rounded-xl p-5 border border-white/5 text-left space-y-3 mb-6">
        {data.payment_reference && (
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs">Referencia</span>
            <span className="text-white text-xs font-mono">{data.payment_reference}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500 text-xs">Monto</span>
          <span className="text-emerald-400 text-sm font-bold">
            ${Number(data.amount_usd).toFixed(2)} USD
          </span>
        </div>
        {data.payment_method && (
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs">Método</span>
            <span className="text-white text-xs">
              {data.payment_method === "debito_inmediato"
                ? "Débito Inmediato"
                : data.payment_method === "transferencia"
                ? "Transferencia Bancaria"
                : "Tarjeta Internacional"}
            </span>
          </div>
        )}
        {data.paid_at && (
          <div className="flex justify-between">
            <span className="text-gray-500 text-xs">Fecha</span>
            <span className="text-white text-xs">
              {new Date(data.paid_at).toLocaleString("es-VE", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs">
        Recibirás una confirmación por WhatsApp y email
      </p>
    </div>
  );
}

function Clock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
