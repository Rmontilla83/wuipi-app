"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "sent">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading || cooldown > 0) return;

    setLoading(true);
    setError("");

    try {
      // Step 1: Verify email exists in Odoo
      const verifyRes = await fetch("/api/portal/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Error al verificar email");
      }
      if (!verifyData.exists) {
        setError("Este email no está registrado como cliente. Si crees que es un error, contacta a soporte.");
        setLoading(false);
        return;
      }

      // Step 2: Send magic link
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/portal/auth/callback`,
        },
      });

      if (otpError) {
        throw new Error(otpError.message);
      }

      setStep("sent");

      // Start cooldown
      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wuipi-bg px-4">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-wuipi-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-wuipi-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-wuipi-card border border-wuipi-border rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-14 mx-auto mb-2 object-contain" />
            <p className="text-sm text-gray-500">Portal de Clientes</p>
          </div>

          {step === "email" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                  Correo electrónico
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
                  <><RefreshCw size={14} className="inline mr-2 animate-spin" />Verificando...</>
                ) : (
                  "Continuar"
                )}
              </button>

              <p className="text-xs text-gray-600 text-center">
                Te enviaremos un enlace de acceso a tu correo. Sin contraseña.
              </p>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Enlace enviado</h3>
                <p className="text-sm text-gray-400">
                  Revisa tu correo <span className="text-white font-medium">{email}</span> y haz clic en el enlace para acceder.
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || cooldown > 0}
                className="text-sm text-wuipi-accent hover:underline disabled:text-gray-600 disabled:no-underline"
              >
                {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar enlace"}
              </button>

              <button
                onClick={() => { setStep("email"); setError(""); }}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-300"
              >
                Usar otro email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
