"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, ChevronDown, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function CobranzasHeader({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleLogout = async () => {
    const sb = createClient();
    try {
      await sb.auth.signOut();
    } catch {
      // ignore
    }
    setOpen(false);
    router.push("/cobranzas/acceso");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 bg-wuipi-card/95 backdrop-blur border-b border-wuipi-border">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-12 object-contain" />
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-wuipi-border">
            <ShieldCheck size={16} className="text-wuipi-accent" />
            <div>
              <p className="text-xs text-gray-500 leading-tight">Panel interno</p>
              <p className="text-sm font-semibold text-white leading-tight">Cobranzas</p>
            </div>
          </div>
        </div>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-wuipi-card-hover transition-colors"
          >
            <User size={14} />
            <span className="hidden sm:inline truncate max-w-[200px]">{userEmail}</span>
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 bg-wuipi-card border border-wuipi-border rounded-xl shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-wuipi-border">
                <p className="text-xs text-gray-500">Sesión iniciada</p>
                <p className="text-sm text-white truncate">{userEmail}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-wuipi-card-hover hover:text-white transition-colors"
              >
                <LogOut size={14} className="text-gray-500" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
