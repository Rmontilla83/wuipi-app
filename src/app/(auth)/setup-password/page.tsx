"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Lock, Check, X, Eye, EyeOff, RefreshCw } from "lucide-react";

const RULES = [
  { id: "length", label: "Minimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "Al menos una mayuscula", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "Al menos una minuscula", test: (p: string) => /[a-z]/.test(p) },
  { id: "number", label: "Al menos un numero", test: (p: string) => /\d/.test(p) },
];

export default function SetupPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checks = RULES.map(r => ({ ...r, passed: r.test(password) }));
  const allPassed = checks.every(c => c.passed);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const canSubmit = allPassed && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        if (updateError.message?.includes("weak") || updateError.message?.includes("password")) {
          setError("La contrasena no cumple los requisitos de seguridad. Intenta con una mas compleja.");
        } else {
          setError(updateError.message);
        }
        return;
      }

      router.push("/comando");
    } catch {
      setError("Error al establecer la contrasena");
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
            <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-20 mx-auto mb-3 object-contain" />
            <h2 className="text-xl font-bold text-white">Crea tu contrasena</h2>
            <p className="text-sm text-gray-500 mt-1">Establece una contrasena segura para acceder al sistema</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Contrasena</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Escribe tu contrasena"
                  className="w-full pl-10 pr-10 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none transition-colors focus:border-wuipi-accent placeholder:text-gray-600"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Requirements */}
            <div className="space-y-1.5 px-1">
              {checks.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  {c.passed ? (
                    <Check size={14} className="text-emerald-400 shrink-0" />
                  ) : (
                    <X size={14} className="text-gray-600 shrink-0" />
                  )}
                  <span className={c.passed ? "text-emerald-400" : "text-gray-500"}>{c.label}</span>
                </div>
              ))}
            </div>

            {/* Confirm */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">Confirmar contrasena</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite tu contrasena"
                  className="w-full pl-10 pr-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none transition-colors focus:border-wuipi-accent placeholder:text-gray-600"
                />
              </div>
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <X size={12} /> Las contrasenas no coinciden
                </p>
              )}
              {passwordsMatch && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <Check size={12} /> Las contrasenas coinciden
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><RefreshCw size={14} className="inline mr-2 animate-spin" />Guardando...</>
              ) : (
                "Crear contrasena y entrar"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
