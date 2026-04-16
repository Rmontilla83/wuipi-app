"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Shield, Settings } from "lucide-react";

const TABS = [
  { label: "Dashboard", path: "/bequant", icon: LayoutDashboard },
  { label: "Suscriptores", path: "/bequant/suscriptores", icon: Users },
  { label: "Políticas", path: "/bequant/politicas", icon: Shield },
  { label: "Configuración", path: "/bequant/configuracion", icon: Settings },
] as const;

export function BequantSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 p-1 bg-wuipi-bg rounded-lg border border-wuipi-border w-fit">
      {TABS.map((tab) => {
        const isActive = pathname === tab.path;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
              isActive
                ? "bg-wuipi-accent/10 text-wuipi-accent border border-wuipi-accent/20"
                : "text-gray-500 hover:text-gray-300 hover:bg-wuipi-card-hover border border-transparent"
            )}
          >
            <Icon size={16} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
