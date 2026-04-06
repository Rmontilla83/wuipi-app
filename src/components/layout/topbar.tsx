"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatTime } from "@/lib/utils";
import { Wifi, Brain, ArrowLeft } from "lucide-react";
import { useDashboardContext } from "./dashboard-context";

interface TopBarProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  showBack?: boolean;
}

export function TopBar({ title, subtitle, icon, actions, showBack }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/comando";
  const shouldShowBack = showBack ?? !isHome;
  const [time, setTime] = useState(new Date());
  const { services, aiStatus } = useDashboardContext();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 px-7 flex items-center justify-between border-b border-wuipi-border bg-wuipi-sidebar shrink-0">
      <div className="flex items-center gap-3">
        {shouldShowBack && (
          <button onClick={() => router.back()}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-wuipi-border text-gray-400 hover:text-white hover:border-wuipi-accent/40 transition-all">
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {subtitle && <span className="text-sm text-gray-500 hidden sm:inline">— {subtitle}</span>}
      </div>

      <div className="flex items-center gap-4">
        {actions}
        {/* Service count */}
        {services && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-wuipi-bg rounded-lg border border-wuipi-border">
            <Wifi size={14} className="text-emerald-400" />
            <span className="text-sm font-bold text-white">{services.total.toLocaleString()}</span>
            <span className="text-xs text-gray-500">servicios</span>
            <span className="text-[10px] text-emerald-400">{services.active.toLocaleString()}</span>
            {services.paused > 0 && <span className="text-[10px] text-amber-400">/ {services.paused.toLocaleString()} pau</span>}
          </div>
        )}

        {/* AI Status */}
        {aiStatus && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
            aiStatus.ai
              ? "bg-wuipi-purple/5 border-wuipi-purple/20"
              : "bg-red-500/5 border-red-500/20"
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              aiStatus.ai ? "bg-wuipi-purple shadow-[0_0_6px] shadow-wuipi-purple" : "bg-red-400"
            }`} />
            <Brain size={14} className={aiStatus.ai ? "text-wuipi-purple" : "text-red-400"} />
            <span className={`text-xs font-semibold ${aiStatus.ai ? "text-wuipi-purple" : "text-red-400"}`}>
              {aiStatus.ai ? "IA Activa" : "IA Inactiva"}
            </span>
            {aiStatus.ai && (
              <span className="text-[10px] text-gray-500">
                {[aiStatus.gemini && "Gemini", aiStatus.claude && "Claude"].filter(Boolean).join(" + ")}
              </span>
            )}
          </div>
        )}

        {/* Clock */}
        <span className="text-sm text-gray-500 tabular-nums font-mono">
          {formatTime(time)}
        </span>
      </div>
    </header>
  );
}
