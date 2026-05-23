"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, RefreshCw, CheckCircle2, AlertCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  auth: "Tu sesión expiró. Inicia de nuevo.",
  callback: "Hubo un problema al iniciar sesión. Inténtalo de nuevo.",
  partner_not_found: "No encontramos tu cuenta de cliente. Contacta a soporte.",
  rate_limit: "Demasiados intentos. Espera un momento y vuelve a intentar.",
};

type Step =
  | { kind: "email" }
  | { kind: "login"; email: string; partnerId: number }
  | { kind: "signup"; email: string; partnerId: number }
  | { kind: "reset-request" }
  | { kind: "reset-sent"; email: string };

export default function PortalLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get("email") || "";
  const errorCode = searchParams.get("error");

  const [step, setStep] = useState<Step>(
    prefilledEmail
      ? { kind: "email" }
      : { kind: "email" }
  );
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    errorCode ? (ERROR_MESSAGES[errorCode] || `Error: ${errorCode}`) : ""
  );

  useEffect(() => {
    if (prefilledEmail && !email) setEmail(prefilledEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledEmail]);

  // ─── Step 1: email lookup ───────────────────────────────
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al verificar el email");
      if (!data.exists) {
        setError("Este correo no está registrado como cliente Wuipi. Verifica que sea el mismo email con el que contrataste el servicio, o contacta a soporte.");
        return;
      }
      const trimmed = email.trim().toLowerCase();
      if (data.hasAccount) {
        setStep({ kind: "login", email: trimmed, partnerId: data.partner_id });
      } else {
        setStep({ kind: "signup", email: trimmed, partnerId: data.partner_id });
      }
      setPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2a: login ─────────────────────────────────────
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email o contraseña incorrectos");
      router.push("/portal/inicio");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2b: signup ────────────────────────────────────
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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
      const res = await fetch("/api/portal/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No pudimos crear tu cuenta");
      router.push("/portal/inicio");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // ─── Reset password ──────────────────────────────────────
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "No pudimos enviar el enlace");
      }
      setStep({ kind: "reset-sent", email: email.trim().toLowerCase() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setError("");
    setPassword("");
    setPasswordConfirm("");
    setStep({ kind: "email" });
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
            <p className="text-sm text-gray-500">Portal de Clientes</p>
          </div>

          {/* Step: email lookup */}
          {step.kind === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  Tu correo registrado en Wuipi
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
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
                disabled={loading || !email.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
              >
                {loading ? (
                  <><RefreshCw size={14} className="inline mr-2 animate-spin" />Verificando…</>
                ) : (
                  "Continuar"
                )}
              </button>
              <p className="text-xs text-gray-600 text-center">
                Ingresa el correo asociado a tu cuenta de cliente Wuipi.
              </p>
            </form>
          )}

          {/* Step: login (email confirmado, ya tiene cuenta) */}
          {step.kind === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <button
                type="button"
                onClick={goBack}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Cambiar email
              </button>
              <p className="text-sm text-gray-400">
                Bienvenido de vuelta, <span className="text-white font-medium">{step.email}</span>
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">Contraseña</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
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
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
              >
                {loading ? (
                  <><RefreshCw size={14} className="inline mr-2 animate-spin" />Ingresando…</>
                ) : (
                  "Iniciar sesión"
                )}
              </button>
              <button
                type="button"
                onClick={() => { setStep({ kind: "reset-request" }); setError(""); }}
                className="block mx-auto text-xs text-wuipi-accent hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          )}

          {/* Step: signup (email confirmado, no tiene cuenta) */}
          {step.kind === "signup" && (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <button
                type="button"
                onClick={goBack}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Cambiar email
              </button>
              <div className="flex items-start gap-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-300">
                  Cliente confirmado: <span className="font-medium">{step.email}</span>. Es tu primera vez aquí — crea una contraseña para acceder.
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  Crea una contraseña (mínimo 8 caracteres)
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
                  <><RefreshCw size={14} className="inline mr-2 animate-spin" />Creando cuenta…</>
                ) : (
                  "Crear contraseña y entrar"
                )}
              </button>
            </form>
          )}

          {/* Step: reset request */}
          {step.kind === "reset-request" && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <button
                type="button"
                onClick={goBack}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Volver
              </button>
              <h3 className="text-white font-semibold">Recuperar contraseña</h3>
              <p className="text-sm text-gray-400">
                Ingresa tu correo registrado y te enviaremos un enlace para crear una nueva contraseña.
              </p>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">Correo</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
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
                disabled={loading || !email.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
              >
                {loading ? (
                  <><RefreshCw size={14} className="inline mr-2 animate-spin" />Enviando…</>
                ) : (
                  "Enviar enlace de recuperación"
                )}
              </button>
            </form>
          )}

          {/* Step: reset sent */}
          {step.kind === "reset-sent" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Enlace enviado</h3>
                <p className="text-sm text-gray-400">
                  Si <span className="text-white font-medium">{step.email}</span> está registrado, recibirás un enlace para crear una nueva contraseña.
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Revisa también la carpeta de spam.
                </p>
              </div>
              <button
                onClick={goBack}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-300"
              >
                Volver al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
