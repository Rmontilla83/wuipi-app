"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, RefreshCw, ChevronDown, ChevronUp, CreditCard, AlertCircle } from "lucide-react";

const fmtUsd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface InvoiceLine {
  product_name: string;
  price_total: number;
}

interface Invoice {
  id: number;
  due_date: string;
  total: number;
  currency: string;
  lines: InvoiceLine[];
}

interface ClientPaymentData {
  partner_id: number;
  name: string;
  email: string;
  vat: string;
  draft_total: number;
  credit_favor_usd: number;
  net_due: number;
  invoices: Invoice[];
  token: string;
}

export default function ClientPaymentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ClientPaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null);
  const [initiating, setInitiating] = useState(false);

  useEffect(() => {
    fetch(`/api/pagar/cliente?token=${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || "Enlace no valido");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4">
        <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-8 max-w-md w-full text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-400" />
          <h2 className="text-white font-bold text-lg mb-2">Enlace no valido</h2>
          <p className="text-gray-400 text-sm">{error || "No se pudo cargar la informacion de pago"}</p>
        </div>
      </div>
    );
  }

  const isAllPaid = data.net_due <= 0;

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Header */}
      <header className="py-4 px-6 border-b border-white/5">
        <div className="max-w-lg mx-auto flex items-center justify-center">
          <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-12 object-contain" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Client info */}
        <div className="text-center">
          <p className="text-gray-500 text-xs uppercase tracking-wider">Estado de cuenta</p>
          <h1 className="text-white font-bold text-xl mt-1">{data.name}</h1>
          {data.vat && <p className="text-gray-500 text-xs mt-1">{data.vat}</p>}
        </div>

        {isAllPaid ? (
          /* All paid */
          <div className="bg-[#111827] border border-emerald-500/20 rounded-2xl p-8 text-center">
            <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
            <h2 className="text-emerald-400 font-bold text-lg mb-1">Estas al dia</h2>
            <p className="text-gray-400 text-sm">No tienes saldo pendiente. Gracias por tu pago.</p>
          </div>
        ) : (
          <>
            {/* Amount summary */}
            <div className="bg-[#111827] border border-[#1e293b] rounded-2xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-sm">Total facturas pendientes</p>
                <p className="text-white font-medium">{fmtUsd(data.draft_total)}</p>
              </div>
              {data.credit_favor_usd > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-gray-400 text-sm">Saldo a favor</p>
                  <p className="text-emerald-400 font-medium">- {fmtUsd(data.credit_favor_usd)}</p>
                </div>
              )}
              <div className="border-t border-[#1e293b] pt-3 flex items-center justify-between">
                <p className="text-white font-bold text-lg">Monto a pagar</p>
                <p className="text-3xl font-bold text-amber-400">{fmtUsd(data.net_due)}</p>
              </div>
            </div>

            {/* Invoice detail — expandable */}
            <div className="space-y-2">
              <p className="text-gray-500 text-xs uppercase tracking-wider">Detalle de facturas</p>
              {data.invoices.map((inv) => (
                <div key={inv.id} className="bg-[#111827] border border-[#1e293b] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedInvoice(expandedInvoice === inv.id ? null : inv.id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">Vence {inv.due_date}</p>
                      <p className="text-gray-600 text-[10px]">{inv.lines.length} servicio{inv.lines.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-amber-400 font-bold text-sm">{fmtUsd(inv.total)}</p>
                      {inv.lines.length > 0 && (
                        expandedInvoice === inv.id ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />
                      )}
                    </div>
                  </button>
                  {expandedInvoice === inv.id && inv.lines.length > 0 && (
                    <div className="border-t border-[#1e293b] px-4 py-2">
                      {inv.lines.map((line, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 text-xs">
                          <span className="text-gray-300">{line.product_name}</span>
                          <span className="text-white font-medium">{fmtUsd(line.price_total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pay button */}
            <button
              onClick={async () => {
                setInitiating(true);
                try {
                  const res = await fetch("/api/pagar/cliente/iniciar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                  });
                  const result = await res.json();
                  if (result.payment_token) {
                    window.location.href = `/pagar/${result.payment_token}`;
                  } else {
                    alert(result.error || "Error al iniciar el pago");
                  }
                } catch {
                  alert("Error de conexion");
                } finally {
                  setInitiating(false);
                }
              }}
              disabled={initiating}
              className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {initiating ? (
                <><RefreshCw size={18} className="animate-spin" /> Preparando pago...</>
              ) : (
                <><CreditCard size={20} /> Pagar {fmtUsd(data.net_due)}</>
              )}
            </button>
            <p className="text-center text-gray-600 text-[10px]">Pago seguro — Debito inmediato, transferencia o tarjeta</p>
          </>
        )}

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-gray-600 text-[10px]">Wuipi Telecomunicaciones C.A.</p>
        </div>
      </main>
    </div>
  );
}
