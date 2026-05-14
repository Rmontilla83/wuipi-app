"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

interface OdooInvoiceInfo {
  number: string;
  date: string;
  due_date: string;
  total: number;
  amount_due: number;
  currency: string;
  products: string[];
}

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
  odoo_invoices?: OdooInvoiceInfo[] | null;
  currency?: string | null;
}

interface BCVData {
  usd_to_bs: number;
  amount_bss: number;
  source: string;
}

type PaymentMethod = "debito_inmediato" | "transferencia" | "stripe" | "paypal" | "c2p";

type C2PStep = "form" | "otp" | "processing";

// Bancos venezolanos (códigos SUDEBAN) — dropdown al confirmar transferencia.
// El banco origen permite verificación automática contra Mercantil transfer-search.
const BANCOS_VENEZUELA: Array<{ code: string; name: string }> = [
  { code: "0102", name: "Banco de Venezuela" },
  { code: "0104", name: "Venezolano de Crédito" },
  { code: "0105", name: "Mercantil" },
  { code: "0108", name: "BBVA Provincial" },
  { code: "0114", name: "Bancaribe" },
  { code: "0115", name: "Exterior" },
  { code: "0128", name: "Banco Caroní" },
  { code: "0134", name: "Banesco" },
  { code: "0137", name: "Sofitasa" },
  { code: "0138", name: "Banco Plaza" },
  { code: "0146", name: "Bangente" },
  { code: "0151", name: "BFC Banco Fondo Común" },
  { code: "0156", name: "100% Banco" },
  { code: "0157", name: "Del Sur" },
  { code: "0163", name: "Banco del Tesoro" },
  { code: "0166", name: "Banco Agrícola" },
  { code: "0168", name: "Bancrecer" },
  { code: "0169", name: "Mi Banco" },
  { code: "0171", name: "Activo" },
  { code: "0172", name: "Bancamiga" },
  { code: "0174", name: "Banplus" },
  { code: "0175", name: "Bicentenario" },
  { code: "0177", name: "Banfanb" },
  { code: "0191", name: "BNC" },
];

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
  const [originBank, setOriginBank] = useState("");
  // Monto en Bs que el cliente declara haber transferido. Pre-llenado con el
  // monto adeudado (lo que ve en pantalla) cuando data carga; editable por si
  // transfirió con tasa BCV antigua que difiere del actual.
  const [declaredAmount, setDeclaredAmount] = useState<string>("");
  const [confirmingSent, setConfirmingSent] = useState(false);
  const [autoVerifiedMsg, setAutoVerifiedMsg] = useState<string | null>(null);
  // Mensaje específico cuando Mercantil confirma la trx pero por monto distinto al adeudado.
  const [amountMismatchInfo, setAmountMismatchInfo] = useState<{
    mercantil_amount: number;
    expected_amount: number;
    declared_amount: number;
    message: string;
  } | null>(null);
  // C2P wizard state
  const [c2pStep, setC2pStep] = useState<C2PStep>("form");
  const [c2pCedula, setC2pCedula] = useState("");
  const [c2pPhone, setC2pPhone] = useState("");
  const [c2pBank, setC2pBank] = useState("");
  const [c2pOtp, setC2pOtp] = useState("");
  const [c2pInfo, setC2pInfo] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for callback status
  const callbackStatus = searchParams.get("status");
  const isPostPayment = callbackStatus === "callback" || callbackStatus === "success";

  // Detect Mercantil error/decline signals from the returnUrl query params.
  // Mercantil may append responseCode/errorCode/error/code on decline (e.g. 4025).
  // We treat any non-success code as a hint that the payment was rejected, even
  // though the DB status remains the source of truth.
  const mercantilErrorCode = (() => {
    const candidates = ["errorCode", "error_code", "responseCode", "response_code", "error", "code"];
    for (const key of candidates) {
      const v = searchParams.get(key);
      if (!v) continue;
      // "000" / "00" / "0000" are success markers in Venezuelan banking
      if (/^0+$/.test(v)) continue;
      return v;
    }
    return null;
  })();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // cache: 'no-store' es CRITICO. Sin esto, Next.js puede cachear el
      // response y el polling se queda viendo el status viejo "viewed" para
      // siempre, sin enterarse de que el webhook ya marco el item como paid.
      const res = await fetch(`/api/cobranzas/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al cargar");
      setData(json);

      // Fetch BCV rate
      if (json.amount_usd) {
        const bcvRes = await fetch(`/api/cobranzas/bcv?amount=${json.amount_usd}`, { cache: "no-store" });
        const bcvJson = await bcvRes.json();
        if (bcvRes.ok) {
          setBcv(bcvJson);
          // Pre-llenar el monto declarado con el monto adeudado actual la
          // primera vez (no sobrescribir si el cliente ya editó).
          setDeclaredAmount(prev => prev || (bcvJson.amount_bss ? bcvJson.amount_bss.toFixed(2) : ""));
        }
      }

      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar los datos");
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  // MEJORA #3 (2026-05-13) — Detección activa de fallos Botón Web.
  // Si el cliente vuelve con un errorCode != success en la URL, dispara
  // inmediatamente el endpoint que marca el item failed + abre caso en
  // kanban. Antes esto esperaba 60min al cron de abandonos.
  // Idempotente del lado server (guard .neq("status","paid")), seguro
  // dispararlo de más; rate limited 5/min por IP+token.
  useEffect(() => {
    if (!isPostPayment || !mercantilErrorCode) return;
    let cancelled = false;
    const referenceFromUrl = searchParams.get("paymentReference")
      || searchParams.get("reference_number")
      || searchParams.get("trxRef")
      || "";
    const messageFromUrl = searchParams.get("message")
      || searchParams.get("mensajeCliente")
      || searchParams.get("description")
      || "";
    fetch(`/api/cobranzas/${token}/mercantil-callback-failure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        errorCode: mercantilErrorCode,
        message: messageFromUrl || undefined,
        paymentReference: referenceFromUrl || undefined,
      }),
    }).then(async (res) => {
      if (cancelled) return;
      // Refetch para que la UI flip a "failed" inmediatamente sin esperar polling
      if (res.ok) fetchData();
    }).catch((err) => {
      console.warn("[Pagar] callback-failure dispatch error:", err);
    });
    return () => { cancelled = true; };
  }, [isPostPayment, mercantilErrorCode, token, fetchData, searchParams]);

  useEffect(() => {
    fetchData().then((json) => {
      // If already paid or no post-payment callback, don't poll
      if (!isPostPayment || !json || json.status === "paid" || json.status === "conciliating") return;

      // Polling agresivo en los primeros 90s (cubre el caso tipico de
      // Mercantil que tarda ~60-90s en mandar el webhook tras el callback).
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/cobranzas/${token}`, { cache: "no-store" });
          const poll = await res.json();
          // Tambien detectar "failed" para mostrar error inmediato en vez de
          // esperar el timeout completo cuando el banco rechazo el pago.
          if (res.ok && (poll.status === "paid" || poll.status === "conciliating" || poll.status === "failed")) {
            setData(poll);
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }
        } catch { /* ignore polling errors */ }
      }, 3000);

      // Tras 90s: mostrar pantalla "No pudimos confirmar" PERO seguir
      // chequeando en background cada 10s por hasta 5 min totales. Si el
      // webhook llega tarde, la UI flip automatico a "Pago recibido" sin
      // que el usuario tenga que recargar.
      timeoutRef.current = setTimeout(() => {
        setPollingTimedOut(true);
        if (pollingRef.current) clearInterval(pollingRef.current);
        // Background polling cada 10s — mucho menos agresivo
        pollingRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/cobranzas/${token}`, { cache: "no-store" });
            const poll = await res.json();
            if (res.ok && (poll.status === "paid" || poll.status === "conciliating" || poll.status === "failed")) {
              setData(poll);
              if (pollingRef.current) clearInterval(pollingRef.current);
            }
          } catch { /* ignore */ }
        }, 10000);

        // Stop final tras 5 min totales — el usuario ya tiene el boton "Intentar de nuevo".
        setTimeout(() => {
          if (pollingRef.current) clearInterval(pollingRef.current);
        }, 4 * 60 * 1000); // 90s + 4min = 5.5 min total
      }, 90_000);
    });

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchData, isPostPayment, token]);

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

  // C2P paso 1: solicita el OTP a Mercantil. Cliente recibe SMS con la clave.
  const handleC2PRequestOtp = async () => {
    setProcessing(true);
    setError("");
    setC2pInfo(null);
    try {
      const res = await fetch("/api/cobranzas/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          method: "c2p",
          c2p: { cedula: c2pCedula, phone: c2pPhone, bankCode: c2pBank },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error solicitando clave");
      setC2pInfo(json.message || "Te enviamos una clave por SMS.");
      setC2pStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al solicitar clave");
    }
    setProcessing(false);
  };

  // C2P paso 2: confirma el cobro con el OTP. Aprobado → pago marcado y notificacion.
  const handleC2PConfirm = async () => {
    setProcessing(true);
    setError("");
    try {
      const res = await fetch("/api/cobranzas/pay/c2p-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          cedula: c2pCedula,
          phone: c2pPhone,
          bankCode: c2pBank,
          otp: c2pOtp,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error confirmando pago");
      // Refrescar para mostrar pantalla de "Pago recibido"
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al confirmar pago");
    }
    setProcessing(false);
  };

  const handleConfirmTransfer = async () => {
    if (!transferRef.trim()) return;
    setConfirmingSent(true);
    setAutoVerifiedMsg(null);
    setAmountMismatchInfo(null);
    try {
      // Parsear el monto declarado. Si está vacío o inválido, omitirlo y el
      // servidor usará el amount_bss del item (comportamiento previo).
      const declaredNum = declaredAmount ? parseFloat(declaredAmount.replace(",", ".")) : NaN;
      const declaredAmountBss = !Number.isNaN(declaredNum) && declaredNum > 0
        ? Math.round(declaredNum * 100) / 100
        : undefined;

      const res = await fetch("/api/cobranzas/pay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reference: transferRef,
          ...(originBank ? { bankCode: originBank } : {}),
          ...(declaredAmountBss !== undefined ? { declaredAmountBss } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");

      // Caso especial: Mercantil confirmó la trx pero por monto distinto al
      // adeudado. Server NO marca paid, devuelve detalles para que el UI
      // muestre mensaje claro con CTA hacia WA cobranzas.
      if (json.amount_mismatch) {
        setAmountMismatchInfo({
          mercantil_amount: Number(json.mercantil_amount),
          expected_amount: Number(json.expected_amount_bss),
          declared_amount: Number(json.declared_amount_bss),
          message: json.message || "El monto difiere del adeudado",
        });
        setData((prev) => prev ? { ...prev, status: "conciliating" } : prev);
        return;
      }

      // Server returns auto_verified=true when Mercantil confirmed the transfer.
      // Map the UI status to "paid" on instant verification, else "conciliating".
      const newStatus: PaymentData["status"] = json.auto_verified ? "paid" : "conciliating";
      setData((prev) => prev ? { ...prev, status: newStatus } : prev);
      if (json.auto_verified) {
        setAutoVerifiedMsg(json.message || "¡Pago confirmado!");
      }
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
        <PaidConfirmation data={data} autoVerifiedMsg={autoVerifiedMsg} />
      </PageShell>
    );
  }

  // ---- Amount mismatch: la trx existe en Mercantil pero por monto distinto ----
  // Tiene precedencia sobre el render genérico de conciliating porque ofrece
  // info accionable (monto trx vs adeudado + CTA WhatsApp cobranzas).
  if (amountMismatchInfo) {
    const diff = amountMismatchInfo.expected_amount - amountMismatchInfo.mercantil_amount;
    const diffAbs = Math.abs(diff);
    const isShortage = diff > 0; // cliente pagó menos que el adeudado
    const waMsg = encodeURIComponent(
      `Hola, transferí Bs ${amountMismatchInfo.mercantil_amount.toFixed(2)} pero la deuda actualizada es Bs ${amountMismatchInfo.expected_amount.toFixed(2)}. Mi referencia: ${transferRef}`
    );
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">El monto difiere del adeudado</h2>
          <p className="text-gray-400 text-sm mb-5">
            Detectamos tu transferencia en el banco, pero el monto no coincide con lo adeudado actualmente
            (la tasa BCV pudo haber cambiado entre tu transferencia y hoy).
          </p>

          <div className="bg-white/[0.03] rounded-xl p-4 border border-amber-500/20 mb-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Transferiste</span>
              <span className="text-white font-mono">Bs {amountMismatchInfo.mercantil_amount.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Adeudado actual</span>
              <span className="text-white font-mono">Bs {amountMismatchInfo.expected_amount.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-t border-white/5 pt-2 flex justify-between text-sm">
              <span className="text-amber-400 font-semibold">
                {isShortage ? "Falta por pagar" : "Pagaste de más"}
              </span>
              <span className="text-amber-400 font-mono font-bold">
                Bs {diffAbs.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {transferRef && (
            <p className="text-gray-500 text-xs mb-4">
              Tu referencia: <span className="font-mono">{transferRef}</span>
            </p>
          )}

          <a
            href={`https://wa.me/584248800723?text=${waMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#25D366]/90"
          >
            Contactar cobranzas por WhatsApp
          </a>
          <p className="text-gray-600 text-[11px] mt-3">
            Nuestro equipo ya tiene tu caso registrado. Te contactaremos para regularizar la diferencia.
          </p>
        </div>
      </PageShell>
    );
  }

  // ---- Conciliating ----
  if (data.status === "conciliating") {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Pago en proceso de verificación</h2>
          <p className="text-gray-400 text-sm mb-4">
            Ya no es necesaria ninguna acción de tu parte. Recibirás una confirmación por WhatsApp cuando sea procesada.
          </p>
          {data.payment_reference && (
            <p className="text-gray-500 text-xs">
              Referencia: {data.payment_reference}
            </p>
          )}
        </div>
      </PageShell>
    );
  }

  // ---- Expired ----
  if (data.status === "expired") {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-gray-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Enlace expirado</h2>
          <p className="text-gray-400 text-sm mb-4">
            Este enlace de pago ha expirado. Contacta a WUIPI para asistencia.
          </p>
          <a
            href="https://wa.me/584248800723"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#25D366]/90"
          >
            Contactar por WhatsApp
          </a>
        </div>
      </PageShell>
    );
  }

  // ---- Failed ----
  if (data.status === "failed") {
    return (
      <PageShell>
        <div className="max-w-md mx-auto text-center py-12">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Error en el pago</h2>
          <p className="text-gray-400 text-sm mb-4">
            Hubo un problema con tu pago. Contacta a WUIPI para asistencia.
          </p>
          <a
            href="https://wa.me/584248800723"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-semibold hover:bg-[#25D366]/90"
          >
            Contactar por WhatsApp
          </a>
        </div>
      </PageShell>
    );
  }

  // ---- Waiting for callback ----
  // CRITICAL: We only show success when the DB confirms status === "paid" (handled
  // above at the "Already paid" branch). Reaching this block means the callback
  // came back from Mercantil but the DB has not flipped to "paid" yet — either the
  // webhook is in-flight, or Mercantil rejected the payment (e.g. error 4025).
  // We MUST NOT assume success on timeout.
  if (isPostPayment) {
    const handleRetry = () => {
      // Strip the callback query params and reset method selection so the user
      // can pick a method again. router.replace would also work, but a hard nav
      // guarantees the polling effect resets cleanly.
      window.location.href = `/pagar/${token}`;
    };

    // Polling timed out without a "paid" status — assume the payment did NOT
    // go through. Show retry instead of false confirmation.
    if (pollingTimedOut) {
      return (
        <PageShell>
          <div className="max-w-md mx-auto text-center py-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-amber-400" />
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">
              No pudimos confirmar tu pago
            </h2>
            <p className="text-gray-400 text-sm mb-2">
              Si realizaste el pago correctamente, recibirás confirmación por WhatsApp y email
              en los próximos minutos.
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Si el pago fue rechazado por tu banco, puedes intentar de nuevo.
            </p>
            {mercantilErrorCode && (
              <p className="text-gray-600 text-[10px] mb-4 font-mono">
                Código del banco: {mercantilErrorCode}
              </p>
            )}
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              <button
                onClick={handleRetry}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#F46800] to-[#ff8534] text-white font-semibold text-sm transition-all hover:shadow-lg active:scale-[0.98]"
              >
                Intentar de nuevo
              </button>
              <a
                href="https://wa.me/584248800723"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl border border-white/10 text-gray-300 text-sm font-medium hover:bg-white/[0.02] inline-flex items-center justify-center gap-2"
              >
                Contactar por WhatsApp
              </a>
            </div>
          </div>
        </PageShell>
      );
    }

    // Still polling — show spinner
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

          {/* Invoice details — show individual invoices if from Odoo */}
          {data.odoo_invoices && data.odoo_invoices.length > 0 ? (
            <div className="mb-4">
              <p className="text-blue-200/60 text-xs mb-2 uppercase tracking-wider">Detalle de facturas</p>
              <div className="bg-white/5 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-blue-200/50">
                      <th className="text-left py-2 px-3 font-medium">Factura</th>
                      <th className="text-left py-2 px-3 font-medium">Servicio</th>
                      <th className="text-right py-2 px-3 font-medium">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.odoo_invoices.map((inv, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-3 text-white font-mono">{inv.number}</td>
                        <td className="py-2 px-3 text-blue-200/80">
                          {inv.products.length > 0
                            ? inv.products.map(p => p.replace(/\[.*?\]\s*/, "")).join(", ")
                            : "—"}
                        </td>
                        <td className="py-2 px-3 text-right text-white font-medium">
                          {inv.amount_due.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td colSpan={2} className="py-2 px-3 text-blue-200/60 font-medium">Total</td>
                      <td className="py-2 px-3 text-right text-white font-bold">
                        {data.odoo_invoices.reduce((s, i) => s + i.amount_due, 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                        <span className="text-blue-200/50 ml-1 font-normal">{data.currency || "VED"}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
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
          )}

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

        {/* Banner contextual cuando el cliente vuelve de un gateway que rechazó
            el pago (PayPal INSTRUMENT_DECLINED, etc). Le explicamos el motivo y
            le sugerimos probar otro método sin sacarlo del recibo. */}
        <GatewayFailureBanner
          status={callbackStatus}
          reason={searchParams.get("reason")}
          gatewayCode={searchParams.get("gateway_code")}
        />

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

          {/* Pago Movil C2P — OCULTO temporalmente (2026-05-11). El código se
              conserva intencionalmente para reactivar cuando se reanude el flujo C2P. */}
          {false && (
            <PaymentMethodCard
              icon={<Smartphone className="w-5 h-5" />}
              title="Pago Móvil"
              subtitle={`Bs. ${amountBss > 0 ? amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 }) : "..."}`}
              description="Paga desde tu banco con tu teléfono (C2P)"
              selected={selectedMethod === "c2p"}
              onClick={() => {
                setSelectedMethod("c2p");
                setC2pStep("form");
                setC2pInfo(null);
                setError("");
              }}
              accent="#10B981"
            />
          )}

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

          {/* Stripe — minimo $0.50 USD por requisito de Stripe Checkout */}
          {(() => {
            const stripeDisabled = Number(data.amount_usd) < 0.5;
            return (
              <PaymentMethodCard
                icon={<CreditCard className="w-5 h-5" />}
                title="Tarjeta Nacional o Internacional (Divisas)"
                subtitle={`$${Number(data.amount_usd).toFixed(2)} USD`}
                description="Visa, Mastercard, American Express"
                selected={selectedMethod === "stripe"}
                onClick={() => !stripeDisabled && setSelectedMethod("stripe")}
                accent="#635BFF"
                disabled={stripeDisabled}
                disabledReason="Monto mínimo $0.50 USD (requisito Stripe)"
              />
            );
          })()}

          {/* PayPal */}
          <PaymentMethodCard
            icon={<Globe className="w-5 h-5" />}
            title="PayPal"
            subtitle={`$${Number(data.amount_usd).toFixed(2)} USD`}
            description="Paga con tu cuenta PayPal o tarjeta"
            selected={selectedMethod === "paypal"}
            onClick={() => setSelectedMethod("paypal")}
            accent="#0070BA"
          />
        </div>

        {/* Action area — sticky on mobile */}
        {selectedMethod === "transferencia" ? (
          <TransferDetails
            amountBss={amountBss}
            bcvRate={bcvRate}
            concept={data.invoice_number || `WPY-${token.replace(/^wpy_/, "").slice(0, 8).toUpperCase()}`}
            transferRef={transferRef}
            setTransferRef={setTransferRef}
            originBank={originBank}
            setOriginBank={setOriginBank}
            declaredAmount={declaredAmount}
            setDeclaredAmount={setDeclaredAmount}
            confirming={confirmingSent}
            onConfirm={handleConfirmTransfer}
            copied={copied}
            onCopy={copyToClipboard}
          />
        ) : selectedMethod === "c2p" ? (
          <C2PWizard
            step={c2pStep}
            cedula={c2pCedula}
            setCedula={setC2pCedula}
            phone={c2pPhone}
            setPhone={setC2pPhone}
            bank={c2pBank}
            setBank={setC2pBank}
            otp={c2pOtp}
            setOtp={setC2pOtp}
            info={c2pInfo}
            processing={processing}
            amountBss={amountBss}
            onRequestOtp={handleC2PRequestOtp}
            onConfirm={handleC2PConfirm}
            onBack={() => { setC2pStep("form"); setC2pInfo(null); setError(""); }}
          />
        ) : selectedMethod ? (
          <div className="sticky bottom-0 left-0 right-0 bg-[#0a0a1a]/95 backdrop-blur-lg py-4 -mx-4 px-4 border-t border-white/5 sm:static sm:bg-transparent sm:backdrop-blur-none sm:py-0 sm:mx-0 sm:px-0 sm:border-0">
            <button
              onClick={() => handlePay(selectedMethod)}
              disabled={processing}
              aria-label={`Pagar $${Number(data.amount_usd).toFixed(2)} USD`}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-white font-semibold text-base transition-all duration-200 shadow-lg hover:shadow-xl active:scale-[0.98]"
              style={{
                background:
                  selectedMethod === "debito_inmediato"
                    ? "linear-gradient(135deg, #03318C, #060633)"
                    : selectedMethod === "paypal"
                    ? "linear-gradient(135deg, #0070BA, #003087)"
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
          </div>
        ) : null}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20" role="alert">
            <p className="text-red-400 text-xs text-center">{error}</p>
          </div>
        )}

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 mt-6 text-gray-500">
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
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
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/img/wuipi-logo.webp" alt="WUIPI" className="h-16 sm:h-20 object-contain" />
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
  disabled,
  disabledReason,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
        disabled
          ? "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
          : selected
          ? "border-opacity-100 bg-opacity-5 scale-[1.02] shadow-lg"
          : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
      }`}
      style={{
        borderColor: !disabled && selected ? accent : undefined,
        backgroundColor: !disabled && selected ? `${accent}08` : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{
            backgroundColor: !disabled && selected ? `${accent}15` : "rgba(255,255,255,0.05)",
            color: !disabled && selected ? accent : "#9ca3af",
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-white text-sm font-medium">{title}</span>
            <span className="text-gray-400 text-xs">{subtitle}</span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            {disabled && disabledReason ? disabledReason : description}
          </p>
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
  originBank,
  setOriginBank,
  declaredAmount,
  setDeclaredAmount,
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
  originBank: string;
  setOriginBank: (v: string) => void;
  declaredAmount: string;
  setDeclaredAmount: (v: string) => void;
  confirming: boolean;
  onConfirm: () => void;
  copied: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  // Detecta si el monto declarado difiere del adeudado para mostrar aviso
  const declaredNum = parseFloat(declaredAmount.replace(",", "."));
  const declaredIsValid = !Number.isNaN(declaredNum) && declaredNum > 0;
  const declaredDiffers = declaredIsValid && Math.abs(declaredNum - amountBss) >= 0.01;
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
          value="0105 0745 65 1745103031"
          extra={<CopyBtn text="01050745651745103031" field="cuenta" />}
          mono
        />
        <DetailRow
          label="RIF"
          value="J-41156771-0"
          extra={<CopyBtn text="J-41156771-0" field="rif" />}
        />
        <DetailRow label="Razón Social" value="WUIPI TECH, C.A." />
        {/* Pago Móvil destino — OCULTO (2026-05-11). Conservado por si se reactiva. */}
        {false && (
          <DetailRow
            label="Pago Móvil"
            value="04248803917"
            extra={<CopyBtn text="04248803917" field="movil" />}
          />
        )}

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
        <p className="text-gray-500 text-[11px] leading-relaxed">
          Seleccioná el banco desde el que transferiste y pegá la referencia.
          Si coincide con nuestro banco, tu pago se confirma al instante.
        </p>
        <select
          value={originBank}
          onChange={(e) => setOriginBank(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-[#F46800]/50 focus:outline-none"
        >
          {/* style en cada <option> porque navegadores en light mode renderean
              fondo blanco por default y heredan text-white → opciones invisibles */}
          <option value="" className="bg-[#0a0a1a] text-white">Tu banco origen…</option>
          {BANCOS_VENEZUELA.map(b => (
            <option key={b.code} value={b.code} className="bg-[#0a0a1a] text-white">{b.name}</option>
          ))}
        </select>
        <input
          value={transferRef}
          onChange={(e) => setTransferRef(e.target.value)}
          placeholder="Número de referencia"
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none"
        />
        <div className="space-y-1">
          <label className="text-gray-500 text-[11px] block">
            Monto exacto en Bs que transferiste
          </label>
          <input
            value={declaredAmount}
            onChange={(e) => setDeclaredAmount(e.target.value)}
            inputMode="decimal"
            placeholder={amountBss.toFixed(2)}
            className={`w-full px-4 py-3 rounded-xl bg-white/[0.03] border text-white text-sm placeholder-gray-600 focus:outline-none ${
              declaredDiffers
                ? "border-amber-400/50 focus:border-amber-400"
                : "border-white/10 focus:border-[#F46800]/50"
            }`}
          />
          {declaredDiffers && (
            <p className="text-amber-400/90 text-[11px] leading-snug">
              El monto difiere del adeudado actual ({amountBss.toFixed(2)} Bs).
              Si transferiste con una tasa BCV anterior, déjalo así. Tu pago se
              detectará y nuestro equipo te contactará para la diferencia.
            </p>
          )}
        </div>
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

function C2PWizard({
  step,
  cedula,
  setCedula,
  phone,
  setPhone,
  bank,
  setBank,
  otp,
  setOtp,
  info,
  processing,
  amountBss,
  onRequestOtp,
  onConfirm,
  onBack,
}: {
  step: C2PStep;
  cedula: string;
  setCedula: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  bank: string;
  setBank: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
  info: string | null;
  processing: boolean;
  amountBss: number;
  onRequestOtp: () => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const formValid = /^\d{6,9}$/.test(cedula) && /^04\d{9}$/.test(phone) && bank.length === 4;
  const otpValid = /^\d{4,8}$/.test(otp);

  if (step === "form") {
    return (
      <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 space-y-3">
        <h4 className="text-white text-sm font-semibold">Pago Móvil C2P</h4>
        <p className="text-gray-500 text-[11px] leading-relaxed">
          Ingresá tu cédula, el teléfono asociado a tu banco y selecciona tu banco.
          Recibirás una clave por SMS para autorizar el pago de
          <span className="text-emerald-400 font-semibold"> Bs. {amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>.
        </p>
        <input
          inputMode="numeric"
          value={cedula}
          onChange={(e) => setCedula(e.target.value.replace(/\D/g, "").slice(0, 9))}
          placeholder="Cédula (sin V, solo números)"
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm placeholder-gray-600 focus:border-emerald-400/50 focus:outline-none"
        />
        <input
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
          placeholder="Teléfono (04XXXXXXXXX)"
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm placeholder-gray-600 focus:border-emerald-400/50 focus:outline-none"
        />
        <select
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm focus:border-emerald-400/50 focus:outline-none"
        >
          <option value="">Tu banco…</option>
          {BANCOS_VENEZUELA.map(b => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>
        <button
          onClick={onRequestOtp}
          disabled={processing || !formValid}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Solicitar clave por SMS"}
        </button>
      </div>
    );
  }

  // step === "otp"
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5 space-y-3">
      <h4 className="text-white text-sm font-semibold">Ingresá la clave</h4>
      {info && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-emerald-300 text-xs">{info}</p>
        </div>
      )}
      <p className="text-gray-500 text-[11px] leading-relaxed">
        Tu banco te envió un SMS con la clave de compra. Ingresala para confirmar el pago.
      </p>
      <input
        inputMode="numeric"
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
        placeholder="Clave (ej: 1234)"
        autoFocus
        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-center text-lg font-mono tracking-widest placeholder-gray-600 focus:border-emerald-400/50 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={processing}
          className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/[0.02] disabled:opacity-50"
        >
          Atrás
        </button>
        <button
          onClick={onConfirm}
          disabled={processing || !otpValid}
          className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Pagar Bs. ${amountBss.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`}
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
    <div className="flex items-center justify-between gap-3 min-w-0">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <div className="flex items-center min-w-0 flex-1 justify-end">
        <span
          title={value}
          className={`text-xs truncate ${highlight ? "text-[#F46800] font-bold text-sm" : "text-white"} ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {extra && <span className="shrink-0">{extra}</span>}
      </div>
    </div>
  );
}

function PaidConfirmation({ data, autoVerifiedMsg }: { data: PaymentData; autoVerifiedMsg?: string | null }) {
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
        {autoVerifiedMsg || "Tu pago ha sido procesado exitosamente"}
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
                : data.payment_method === "c2p"
                ? "Pago Móvil C2P"
                : data.payment_method === "paypal"
                ? "PayPal"
                : "Tarjeta Nacional o Internacional (Divisas)"}
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

      <p className="text-gray-600 text-xs mb-6">
        Recibirás una confirmación por WhatsApp y email
      </p>

      {/* Acciones tras el pago — el cliente decide a donde volver */}
      <div className="flex flex-col gap-2 max-w-xs mx-auto">
        <a
          href="https://wuipi.net"
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#03318C] to-[#060633] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Volver a wuipi.net
        </a>
        <a
          href="https://api.wuipi.net/portal/inicio"
          className="w-full py-3 rounded-xl border border-white/10 text-gray-300 text-sm font-medium hover:bg-white/[0.02] transition-colors"
        >
          Ir a mi portal
        </a>
      </div>
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

// ──────────────────────────────────────────────────────────────────────────
// Banner contextual cuando el cliente regresa al recibo después de que un
// gateway externo (PayPal, Mercantil) rechazó el pago. Le mostramos el
// motivo en lenguaje claro y le sugerimos probar otro método sin tener que
// salirse del flujo.
// ──────────────────────────────────────────────────────────────────────────
function GatewayFailureBanner({
  status,
  reason,
  gatewayCode,
}: {
  status: string | null;
  reason: string | null;
  gatewayCode: string | null;
}) {
  if (status !== "failed") return null;

  // Mensajes user-friendly por reason slug. El slug viene del handler del
  // gateway (ej. /api/cobranzas/webhook/paypal lo arma desde el `issue` de
  // PayPal: INSTRUMENT_DECLINED → "instrument_declined").
  const messages: Record<string, { title: string; body: string }> = {
    instrument_declined: {
      title: "PayPal rechazó tu método de pago",
      body:
        "PayPal no pudo procesar el cobro con la tarjeta o cuenta que usaste. " +
        "Esto suele pasar cuando el banco emisor bloquea el pago internacional, " +
        "la tarjeta no tiene fondos suficientes, o tu cuenta PayPal tiene alguna " +
        "restricción. Probá con otro método más abajo (transferencia, débito " +
        "inmediato o tarjeta vía Stripe).",
    },
    insufficient_funds: {
      title: "Fondos insuficientes",
      body:
        "Tu cuenta PayPal o tarjeta no tiene saldo suficiente. Probá con otro " +
        "método de pago.",
    },
    payer_cannot_pay: {
      title: "PayPal no acepta este pago",
      body:
        "Tu cuenta PayPal no puede completar la transacción. Probá con otra " +
        "cuenta, o usá tarjeta directa vía Stripe / transferencia bancaria.",
    },
    transaction_refused: {
      title: "PayPal rechazó la transacción",
      body:
        "Por razones de seguridad, PayPal no procesó el pago. Probá con otro " +
        "método de pago.",
    },
  };

  const reasonKey = reason || "";
  const msg = messages[reasonKey] || {
    title: "No pudimos procesar el pago",
    body:
      "El método de pago que usaste rechazó la transacción. Probá con otro " +
      "método de los que aparecen abajo, o contactanos por WhatsApp si necesitás ayuda.",
  };

  return (
    <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-red-300 text-sm font-semibold mb-1">{msg.title}</p>
          <p className="text-gray-400 text-xs leading-relaxed">{msg.body}</p>
          {gatewayCode && (
            <p className="text-gray-600 text-[10px] mt-2 font-mono">
              Código: {gatewayCode}
            </p>
          )}
          <a
            href="https://wa.me/584248800723"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-[#25D366] text-xs font-medium hover:underline"
          >
            ¿Necesitas ayuda? Escríbenos por WhatsApp →
          </a>
        </div>
      </div>
    </div>
  );
}
