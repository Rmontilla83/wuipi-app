"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  CreditCard,
  Smartphone,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowRight,
  Shield,
} from "lucide-react";

// --- Types ---

interface PaymentStatus {
  token: string;
  status: string;
  amount: number;
  currency: string;
  payment_method?: string;
  reference_number?: string;
  authorization_code?: string;
  error_message?: string;
  created_at?: string;
  completed_at?: string;
  invoice?: {
    invoice_number: string;
    client_name: string;
    total: number;
    balance_due: number;
    status: string;
  } | null;
}

// --- Component ---

export default function CheckoutPage() {
  const params = useParams();
  const token = params.token as string;

  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/mercantil/status/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Pago no encontrado");
        return;
      }
      setPayment(data);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll for status updates when pending
  useEffect(() => {
    if (!payment || payment.status !== "pending") return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [payment, fetchStatus]);

  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-[#F46800]" />
          <p className="mt-4 text-gray-400">Cargando información del pago...</p>
        </div>
      </PageShell>
    );
  }

  if (error || !payment) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20">
          <XCircle className="w-14 h-14 text-red-400" />
          <h2 className="mt-4 text-xl font-bold text-white">Pago no encontrado</h2>
          <p className="mt-2 text-gray-400">{error || "El enlace de pago no es válido o ha expirado."}</p>
        </div>
      </PageShell>
    );
  }

  // Render based on status
  if (payment.status === "confirmed" || payment.status === "approved") {
    return (
      <PageShell>
        <StatusCard
          icon={<CheckCircle2 className="w-16 h-16 text-green-400" />}
          title="Pago Aprobado"
          subtitle="Tu pago fue procesado exitosamente"
          payment={payment}
          color="green"
        />
      </PageShell>
    );
  }

  if (payment.status === "rejected" || payment.status === "expired") {
    return (
      <PageShell>
        <StatusCard
          icon={<XCircle className="w-16 h-16 text-red-400" />}
          title={payment.status === "expired" ? "Pago Expirado" : "Pago Rechazado"}
          subtitle={payment.error_message || "No se pudo procesar el pago"}
          payment={payment}
          color="red"
        />
      </PageShell>
    );
  }

  // Pending — show payment methods
  return (
    <PageShell>
      <div className="max-w-md mx-auto">
        {/* Amount Card */}
        <div className="bg-gradient-to-br from-[#03318C] to-[#060633] rounded-2xl p-6 mb-6 border border-[#03318C]/30">
          {payment.invoice && (
            <p className="text-sm text-gray-400 mb-1">
              Factura {payment.invoice.invoice_number}
            </p>
          )}
          {payment.invoice && (
            <p className="text-sm text-gray-300 mb-3">{payment.invoice.client_name}</p>
          )}
          <div className="text-center py-4">
            <p className="text-sm text-gray-400 mb-1">Monto a pagar</p>
            <p className="text-4xl font-bold text-white">
              {payment.currency === "VES" ? "Bs. " : "$ "}
              {Number(payment.amount).toLocaleString("es-VE", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        {/* Payment Methods */}
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Selecciona tu método de pago
        </h3>

        <div className="space-y-3">
          <PaymentMethodButton
            icon={<Building2 className="w-6 h-6" />}
            label="Débito Inmediato"
            description="Cualquier banco venezolano"
            payment={payment}
          />
          <PaymentMethodButton
            icon={<CreditCard className="w-6 h-6" />}
            label="Tarjeta de Crédito/Débito"
            description="Visa, Mastercard, Diners"
            payment={payment}
          />
          <PaymentMethodButton
            icon={<Smartphone className="w-6 h-6" />}
            label="Pago Móvil C2P"
            description="Desde tu app bancaria"
            payment={payment}
          />
        </div>

        {/* Waiting indicator */}
        <div className="mt-6 flex items-center justify-center gap-2 text-gray-500 text-sm">
          <Clock className="w-4 h-4" />
          <span>Esperando confirmación del pago...</span>
        </div>

        {/* Security badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-gray-600 text-xs">
          <Shield className="w-3.5 h-3.5" />
          <span>Pagos procesados por Banco Mercantil. Conexión cifrada AES-128.</span>
        </div>
      </div>
    </PageShell>
  );
}

// --- Sub-components ---

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060633] flex flex-col">
      {/* Header */}
      <header className="py-4 px-6 border-b border-white/5">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-9 object-contain" />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-8">{children}</main>

      {/* Footer */}
      <footer className="py-4 px-6 border-t border-white/5 text-center">
        <p className="text-xs text-gray-600">
          WUIPI Telecomunicaciones C.A. &middot; Puerto La Cruz, Anzoátegui
        </p>
      </footer>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  subtitle,
  payment,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  payment: PaymentStatus;
  color: "green" | "red";
}) {
  const borderColor = color === "green" ? "border-green-500/20" : "border-red-500/20";

  return (
    <div className={`max-w-md mx-auto bg-[#0a0e2a] rounded-2xl p-8 border ${borderColor} text-center`}>
      <div className="flex justify-center mb-4">{icon}</div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      <p className="text-gray-400 mb-6">{subtitle}</p>

      <div className="bg-[#060633] rounded-xl p-4 space-y-3 text-left text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Monto</span>
          <span className="text-white font-semibold">
            {payment.currency === "VES" ? "Bs. " : "$ "}
            {Number(payment.amount).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
          </span>
        </div>
        {payment.reference_number && (
          <div className="flex justify-between">
            <span className="text-gray-500">Referencia</span>
            <span className="text-white font-mono">{payment.reference_number}</span>
          </div>
        )}
        {payment.authorization_code && (
          <div className="flex justify-between">
            <span className="text-gray-500">Autorización</span>
            <span className="text-white font-mono">{payment.authorization_code}</span>
          </div>
        )}
        {payment.payment_method && (
          <div className="flex justify-between">
            <span className="text-gray-500">Método</span>
            <span className="text-white">{payment.payment_method}</span>
          </div>
        )}
        {payment.invoice && (
          <div className="flex justify-between">
            <span className="text-gray-500">Factura</span>
            <span className="text-white">{payment.invoice.invoice_number}</span>
          </div>
        )}
        {payment.completed_at && (
          <div className="flex justify-between">
            <span className="text-gray-500">Fecha</span>
            <span className="text-white">
              {new Date(payment.completed_at).toLocaleString("es-VE")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentMethodButton({
  icon,
  label,
  description,
  payment,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  payment: PaymentStatus;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    // In production: this would redirect to Mercantil.
    // For now, the redirect_url was already set when the payment was created.
    // The button just triggers the redirect flow.
    const redirectBase =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/mercantil/create-payment`
        : "";

    // Re-trigger payment to get the actual redirect URL
    fetch("/api/mercantil/create-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_token: payment.token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.redirect_url) {
          window.location.href = data.redirect_url;
        }
      })
      .catch(() => setLoading(false));
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-[#0a0e2a]
                 hover:border-[#F46800]/40 hover:bg-[#0a0e2a]/80 transition-all group"
    >
      <div className="w-12 h-12 rounded-lg bg-[#03318C]/20 flex items-center justify-center text-[#F46800] group-hover:bg-[#F46800]/10 transition-colors">
        {icon}
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#F46800]" />
      ) : (
        <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-[#F46800] transition-colors" />
      )}
    </button>
  );
}
