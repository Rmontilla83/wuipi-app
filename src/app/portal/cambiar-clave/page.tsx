"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Lock, RefreshCw, CheckCircle2, AlertCircle, Eye, EyeOff, ArrowLeft } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (currentPassword === newPassword) {
      setError("La nueva contraseña debe ser distinta de la actual");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No pudimos cambiar tu contraseña");
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => router.push("/portal/inicio"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.back()}
        className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
      >
        <ArrowLeft size={12} /> Volver
      </button>

      <h2 className="text-lg font-bold text-white">Cambiar contraseña</h2>

      <Card className="!p-5">
        {success ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
            <p className="text-white font-medium">Contraseña actualizada</p>
            <p className="text-xs text-gray-500">Redirigiendo…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                Contraseña actual
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={show ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none focus:border-wuipi-accent"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                Nueva contraseña (mínimo 8 caracteres)
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none focus:border-wuipi-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5 font-medium">
                Confirma la nueva contraseña
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-xl text-white text-sm outline-none focus:border-wuipi-accent"
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
              disabled={loading || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
              className="w-full py-3.5 bg-gradient-to-r from-wuipi-accent to-wuipi-purple rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-wait"
            >
              {loading ? (
                <><RefreshCw size={14} className="inline mr-2 animate-spin" />Guardando…</>
              ) : (
                "Cambiar contraseña"
              )}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
