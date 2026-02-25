"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";
import type { UserProfile } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";
import {
  Target,
  Brain,
  Headphones,
  TrendingUp,
  Building2,
  Users,
  Globe,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

// Navigation structure with logical groups
interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  path: string;
  highlight?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Estratégico",
    items: [
      { id: "comando", label: "Centro de Comando", icon: Target, path: "/comando" },
      { id: "supervisor", label: "Supervisor IA", icon: Brain, path: "/supervisor", highlight: true },
    ],
  },
  {
    label: "Operativo",
    items: [
      { id: "soporte", label: "CRM Soporte", icon: Headphones, path: "/soporte" },
      { id: "ventas", label: "CRM Ventas", icon: TrendingUp, path: "/ventas" },
    ],
  },
  {
    label: "Administrativo",
    items: [
      { id: "erp", label: "ERP Administrativo", icon: Building2, path: "/erp" },
      { id: "clientes", label: "Clientes", icon: Users, path: "/clientes" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { id: "portal-admin", label: "Portal Clientes", icon: Globe, path: "/portal-admin" },
      { id: "configuracion", label: "Configuración", icon: Settings, path: "/configuracion" },
    ],
  },
];

interface SidebarProps {
  user: UserProfile;
}

export function Sidebar({ user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const allowedModules = ROLE_PERMISSIONS[user.role] || [];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // Filter groups: only show groups that have at least one visible item
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowedModules.includes(item.id)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        "h-screen flex flex-col bg-wuipi-sidebar border-r border-wuipi-border transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-3 border-b border-wuipi-border h-16 shrink-0",
          collapsed ? "justify-center px-3" : "px-5"
        )}
      >
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-wuipi-accent to-wuipi-purple flex items-center justify-center text-white font-extrabold text-sm shrink-0">
          W
        </div>
        {!collapsed && (
          <span className="text-xl font-bold text-white tracking-tight">
            Wuipi
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {visibleGroups.map((group, groupIndex) => (
          <div key={group.label}>
            {/* Group separator */}
            {groupIndex > 0 && (
              <div className="my-2 mx-3 border-t border-wuipi-border/50" />
            )}

            {/* Group label */}
            {!collapsed && (
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                {group.label}
              </div>
            )}

            {/* Group items */}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
                const Icon = item.icon;
                const isAI = item.highlight;

                return (
                  <Link
                    key={item.id}
                    href={item.path}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      collapsed && "justify-center px-0",
                      isActive
                        ? isAI
                          ? "bg-wuipi-purple/10 text-wuipi-purple border border-wuipi-purple/20"
                          : "bg-wuipi-accent/10 text-wuipi-accent border border-wuipi-accent/20"
                        : "text-gray-500 hover:bg-wuipi-card-hover hover:text-gray-300 border border-transparent"
                    )}
                  >
                    <Icon size={20} className="shrink-0" />
                    {!collapsed && (
                      <span className="flex items-center gap-2 truncate">
                        {item.label}
                        {isAI && !isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-wuipi-purple shadow-[0_0_6px] shadow-wuipi-purple glow-dot" />
                        )}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: Collapse + User */}
      <div className="border-t border-wuipi-border p-2 space-y-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                   border border-wuipi-border text-gray-500 hover:text-gray-300 text-xs transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Colapsar</>}
        </button>

        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 bg-wuipi-bg rounded-lg",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-wuipi-accent to-wuipi-purple flex items-center justify-center text-white text-xs font-bold shrink-0">
            {getInitials(user.full_name)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {user.full_name}
              </div>
              <div className="text-xs text-gray-500 capitalize">{user.role}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-red-400 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
