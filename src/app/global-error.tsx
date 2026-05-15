"use client";

import { useEffect } from "react";

// Global error boundary — último recurso cuando un error escapa al error.tsx
// de cada route group. Reemplaza TODA la app (no puede usar el root layout
// porque ese también puede ser el origen del error).
//
// Muestra el error real en lugar del mensaje genérico de Next.js. Ayuda
// MUCHO a diagnosticar bugs en producción cuando no hay DevTools accesible.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log al server (puede fallar si el bug está antes de que cargue fetch).
    try {
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
          scope: "global",
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, background: "#0a0f1a", color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ maxWidth: 480, width: "100%", background: "#111827", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              Algo salió mal
            </h2>
            <p style={{ fontSize: 14, color: "#9ca3af", textAlign: "center", marginBottom: 16 }}>
              Hubo un error inesperado en la aplicación.
            </p>

            <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12 }}>
              <p style={{ color: "#d1d5db", marginBottom: 4 }}><strong>Mensaje:</strong> {error.message || "(sin mensaje)"}</p>
              {error.digest && (
                <p style={{ color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                  <strong style={{ color: "#d1d5db" }}>Digest:</strong> {error.digest}
                </p>
              )}
            </div>

            <button
              onClick={reset}
              style={{ width: "100%", padding: "12px 16px", background: "#10b981", color: "#fff", border: 0, borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Reintentar
            </button>
            <a
              href="https://wa.me/584248800723"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", textAlign: "center", marginTop: 8, padding: "12px 16px", color: "#25D366", border: "1px solid rgba(37,211,102,0.4)", borderRadius: 12, fontSize: 14, fontWeight: 500, textDecoration: "none" }}
            >
              Contactar por WhatsApp
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
