"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AccesoForm() {
  const params = useSearchParams();
  const initialError =
    params.get("error") === "forbidden"
      ? "Tu cuenta no tiene permiso para acceder al panel de Cobranzas."
      : "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  const sb = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    console.log("[cobranzas/acceso] iniciando signIn para", email);
    const { data: signData, error: signErr } = await sb.auth.signInWithPassword({ email, password });

    if (signErr) {
      console.error("[cobranzas/acceso] signIn falló:", signErr);
      const msg =
        signErr.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : signErr.message || "No se pudo iniciar sesión.";
      setError(msg);
      setLoading(false);
      return;
    }

    console.log("[cobranzas/acceso] signIn OK — userId:", signData.user?.id);

    // Esperar a que la sesión esté escrita en cookies.
    await sb.auth.getSession();

    // Verificar server-side que la sesión + permisos están bien antes
    // de redirigir. Si algo falla, muestro el motivo exacto.
    const res = await fetch("/api/cobranzas/panel/whoami", { cache: "no-store" });
    const who = await res.json();
    console.log("[cobranzas/acceso] whoami →", who);

    if (!who.canRead) {
      const reasons: Record<string, string> = {
        no_session:
          "El login fue exitoso pero la sesión no se propagó al servidor. Recarga la página y vuelve a intentar.",
        profile_not_found:
          `Tu usuario está autenticado pero no tiene fila en la tabla profiles (id ${who.userId}). Pide al admin que la cree.`,
        profile_inactive: "Tu cuenta está marcada como inactiva. Pide al admin que la reactive.",
        role_not_allowed: `Tu rol (${who.role}) no tiene permiso para acceder al panel de Cobranzas.`,
        profile_query_error: `Error consultando tu perfil: ${who.detail}`,
      };
      setError(reasons[who.reason] || `Error inesperado: ${who.reason}`);
      setLoading(false);
      return;
    }

    window.location.href = "/cobranzas/transacciones";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wuipi-bg">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-wuipi-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-wuipi-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4">
        <div className="bg-wuipi-card border border-wuipi-border rounded-2xl p-10 shadow-2xl">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-20 mx-auto mb-3 object-contain" />
            <h1 className="text-lg font-semibold text-white">Panel de Cobranzas</h1>
            <p className="text-sm text-gray-500 mt-1">Acceso interno · solo personal autorizado</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                className="w-full px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none transition-colors focus:border-wuipi-accent placeholder:text-gray-600"
                placeholder="tu@wuipi.net"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none transition-colors focus:border-wuipi-accent placeholder:text-gray-600"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
            >
              {loading ? "Ingresando…" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function CobranzasAcceso() {
  return (
    <Suspense>
      <AccesoForm />
    </Suspense>
  );
}
