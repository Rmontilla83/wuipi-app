"use client";

import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { usePortal } from "@/lib/portal/context";

export function PortalHeader() {
  const router = useRouter();
  const { customerName } = usePortal();

  const handleLogout = async () => {
    // El endpoint /api/portal/logout limpia AMBAS sesiones: la cookie HMAC
    // propia (wpi_session) que setea /portal/invite, y la sesión Supabase
    // del Magic Link clásico. Esto es lo correcto porque el portal acepta
    // cualquiera de las dos como autoridad — limpiar solo una dejaría al
    // cliente sesión-parcial que confunde al usuario.
    try {
      await fetch("/api/portal/logout", { method: "POST", cache: "no-store" });
    } catch {
      // Ignorar — el redirect a /portal/acceso de todas formas pone al user
      // fuera del portal; si la cookie quedó, expira sola en 30 días.
    }
    router.push("/portal/acceso");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 bg-wuipi-card/95 backdrop-blur border-b border-wuipi-border px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-20 object-contain" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <User size={14} />
            <span className="hidden sm:inline truncate max-w-[180px]">{customerName}</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-wuipi-card-hover transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
