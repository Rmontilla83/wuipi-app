"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, RefreshCw, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";

/**
 * Recibe al cliente después de hacer click en el enlace de reseteo de
 * password. Supabase pone el access_token en el fragment (#) de la URL,
 * que solo es accesible client-side.
 */
export default function ResetPasswordPage() {
  const router = useRouter();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Extract access_token from URL hash (Supabase reset format)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      setTokenError("Enlace inválido. Pide uno nuevo desde 'Olvidé mi contraseña'.");
      return;
    }
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const token = params.get("access_token");
    const errParam = params.get("error_description");
    if (errParam) {
      setTokenError(decodeURIComponent(errParam));
      return;
    }
    if (!token) {
      setTokenError("Enlace inválido o expirado. Pide uno nuevo desde 'Olvidé mi contraseña'.");
      return;
    }
    setAccessToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !accessToken) return;
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No pudimos actualizar la contraseña");
      setSuccess(true);
      setTimeout(() => router.push("/portal/inicio"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wuipi-bg px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-wuipi-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-wuipi-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-wuipi-card border border-wuipi-border rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-24 mx-auto mb-2 object-contain" />
            <p className="text-sm text-gray-500">Nueva contraseña</p>
          </div>

          {tokenError ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400">{tokenError}</p>
              </div>
              <button
                onClick={() => router.push("/portal/acceso")}
                className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Contraseña actualizada</h3>
                <p className="text-sm text-gray-400">Redirigiendo a tu portal…</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-400">
                Crea una nueva contraseña para tu cuenta.
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  Nueva contraseña (mínimo 8 caracteres)
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoFocus
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full pl-10 pr-10 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none transition-colors focus:border-wuipi-accent placeholder:text-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  Confirma la contraseña
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                    className="w-full pl-10 pr-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none transition-colors focus:border-wuipi-accent placeholder:text-gray-600"
                  />
                </div>
              </div>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || password.length < 8 || password !== passwordConfirm}
                className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
              >
                {loading ? (
                  <><RefreshCw size={14} className="inline mr-2 animate-spin" />Actualizando…</>
                ) : (
                  "Guardar nueva contraseña"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
