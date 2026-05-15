"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

// Error boundary específico para todas las páginas /pagar/* (cliente, wpy_token,
// cliente/[token]). Sin esto, cualquier excepción no manejada en client-side
// muestra el mensaje genérico de Next.js "Application error: a client-side
// exception has occurred" sin pista del error real.
//
// Este componente muestra el mensaje + digest del error en pantalla para que
// el user pueda copiarlo y reportarlo. También loguea al server para que
// aparezca en Vercel logs.

export default function PagarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log al server para tener registro central de errores client-side en
    // el flow de pago. El endpoint solo escribe en portal_invite_logs y no
    // requiere auth.
    fetch("/api/log-client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        path: typeof window !== "undefined" ? window.location.pathname : "",
        url: typeof window !== "undefined" ? window.location.href : "",
        message: error.message,
        stack: error.stack?.slice(0, 2000),
        digest: error.digest,
      }),
    }).catch(() => {});
    console.error("[/pagar error boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center px-4">
      <div className="bg-[#111827] border border-red-500/30 rounded-2xl p-6 max-w-md w-full">
        <AlertCircle size={40} className="mx-auto mb-4 text-red-400" />
        <h2 className="text-white font-bold text-lg text-center mb-2">
          Algo salió mal procesando el pago
        </h2>
        <p className="text-gray-400 text-sm text-center mb-4">
          Tu deuda no fue cobrada. Toca &ldquo;Reintentar&rdquo; o contáctanos.
        </p>

        {/* Detalle del error — visible para que el usuario lo pueda reportar */}
        <details className="bg-black/40 rounded-lg p-3 mb-4 text-xs">
          <summary className="text-gray-500 cursor-pointer">Detalles técnicos</summary>
          <div className="mt-2 space-y-1 text-gray-400 break-all">
            <p><strong className="text-gray-300">Mensaje:</strong> {error.message || "(sin mensaje)"}</p>
            {error.digest && (
              <p><strong className="text-gray-300">Digest:</strong> <span className="font-mono">{error.digest}</span></p>
            )}
          </div>
        </details>

        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full py-3 bg-emerald-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-emerald-500/90"
          >
            <RefreshCw size={14} /> Reintentar
          </button>
          <a
            href="https://wa.me/584248800723"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 border border-[#25D366]/40 text-[#25D366] rounded-xl font-medium text-sm text-center hover:bg-[#25D366]/10"
          >
            Contactar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
