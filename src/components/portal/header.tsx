"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, User, KeyRound, ChevronDown } from "lucide-react";
import { usePortal } from "@/lib/portal/context";

export function PortalHeader() {
  const router = useRouter();
  const { customerName } = usePortal();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await fetch("/api/portal/logout", { method: "POST", cache: "no-store" });
    } catch {
      /* ignore — redirect lo saca igual */
    }
    setMenuOpen(false);
    router.push("/portal/acceso");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 bg-wuipi-card/95 backdrop-blur border-b border-wuipi-border px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-20 object-contain" />
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-wuipi-card-hover transition-colors"
          >
            <User size={14} />
            <span className="hidden sm:inline truncate max-w-[180px]">{customerName || "Mi cuenta"}</span>
            <ChevronDown size={14} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-wuipi-card border border-wuipi-border rounded-xl shadow-2xl overflow-hidden">
              <Link
                href="/portal/cambiar-clave"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-wuipi-card-hover hover:text-white transition-colors"
              >
                <KeyRound size={14} className="text-gray-500" />
                Cambiar contraseña
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-wuipi-card-hover hover:text-white transition-colors border-t border-wuipi-border"
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
