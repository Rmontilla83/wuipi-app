"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wifi, FileText, Headphones, Gauge } from "lucide-react";

const NAV_ITEMS = [
  { href: "/portal/inicio", label: "Inicio", icon: Home },
  { href: "/portal/suscripciones", label: "Servicios", icon: Wifi },
  { href: "/portal/mi-conexion", label: "Mi Conexión", icon: Gauge },
  { href: "/portal/facturas", label: "Facturas", icon: FileText },
  { href: "/portal/ayuda", label: "Soporte", icon: Headphones },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-wuipi-card/95 backdrop-blur border-t border-wuipi-border sm:static sm:border-t-0 sm:border-b sm:border-wuipi-border">
      <div className="max-w-3xl mx-auto flex items-center justify-around sm:justify-start sm:gap-1 px-2 py-1 sm:px-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/portal/inicio" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 px-3 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                active
                  ? "text-wuipi-accent"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <item.icon size={18} className="sm:w-4 sm:h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
