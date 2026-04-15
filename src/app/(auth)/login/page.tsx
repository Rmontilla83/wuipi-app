"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    authError === "auth" ? "El enlace de invitación expiró o ya fue usado. Solicita uno nuevo al administrador." : ""
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[Login] Supabase error:", error.message, error.status);
      const msg = error.message === "Invalid login credentials"
        ? "Credenciales inválidas. Intenta de nuevo."
        : error.message || "Error al iniciar sesión";
      setError(msg);
      setLoading(false);
      return;
    }

    router.push("/comando");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-wuipi-bg">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-wuipi-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-wuipi-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md mx-4">
        <div className="bg-wuipi-card border border-wuipi-border rounded-2xl p-10 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-10">
            <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-24 mx-auto mb-2 object-contain" />
            <p className="text-sm text-gray-500">
              Plataforma de Gestión ISP
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl
                         text-white text-sm outline-none transition-colors
                         focus:border-wuipi-accent placeholder:text-gray-600"
                placeholder="tu@wuipi.com"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl
                         text-white text-sm outline-none transition-colors
                         focus:border-wuipi-accent placeholder:text-gray-600"
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
              className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple
                       rounded-xl text-white font-semibold text-sm
                       hover:opacity-90 transition-opacity
                       disabled:opacity-50 disabled:cursor-wait"
            >
              {loading ? "Ingresando..." : "Iniciar Sesión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
