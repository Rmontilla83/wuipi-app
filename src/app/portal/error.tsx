"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Portal Error]", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[#0a0a0f]">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={32} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Algo salio mal</h2>
        <p className="text-sm text-gray-400 mb-6">
          Ocurrio un error inesperado. Por favor intente de nuevo.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors"
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    </div>
  );
}
