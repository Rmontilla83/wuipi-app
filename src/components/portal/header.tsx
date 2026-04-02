"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, User } from "lucide-react";
import { usePortal } from "@/lib/portal/context";

export function PortalHeader() {
  const router = useRouter();
  const { customerName } = usePortal();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/portal/acceso");
  };

  return (
    <header className="sticky top-0 z-50 bg-wuipi-card/95 backdrop-blur border-b border-wuipi-border px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-wuipi-accent to-wuipi-purple flex items-center justify-center text-white font-extrabold text-sm">
            W
          </div>
          <span className="text-white font-semibold text-sm hidden sm:block">WUIPI</span>
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
