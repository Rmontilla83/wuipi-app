"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Wuipi Error]", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={32} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Algo salió mal</h2>
        <p className="text-sm text-gray-400 mb-6">
          Ocurrió un error inesperado. Puedes intentar recargar o volver al inicio.
        </p>
        {process.env.NODE_ENV === "development" && (
          <pre className="text-xs text-red-400/70 bg-red-400/5 rounded-lg p-3 mb-6 text-left overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-wuipi-accent text-white hover:bg-wuipi-accent/90 transition-colors"
          >
            <RefreshCw size={14} /> Reintentar
          </button>
          <a
            href="/comando"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-wuipi-border text-gray-400 hover:text-white transition-colors"
          >
            <Home size={14} /> Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
