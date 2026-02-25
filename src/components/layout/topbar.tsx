"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/utils";
import { Users, Brain } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, icon, actions }: TopBarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 px-7 flex items-center justify-between border-b border-wuipi-border bg-wuipi-sidebar shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {subtitle && <span className="text-sm text-gray-500 hidden sm:inline">— {subtitle}</span>}
      </div>

      <div className="flex items-center gap-4">
        {actions}
        {/* Client count */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-wuipi-bg rounded-lg border border-wuipi-border">
          <Users size={14} className="text-gray-500" />
          <span className="text-sm font-bold text-white">1,173</span>
          <span className="text-xs text-gray-500">clientes</span>
        </div>

        {/* AI Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-wuipi-purple/5 rounded-lg border border-wuipi-purple/20">
          <span className="w-2 h-2 rounded-full bg-wuipi-purple shadow-[0_0_6px] shadow-wuipi-purple glow-dot" />
          <Brain size={14} className="text-wuipi-purple" />
          <span className="text-xs font-semibold text-wuipi-purple">IA Activa</span>
        </div>

        {/* Clock */}
        <span className="text-sm text-gray-500 tabular-nums font-mono">
          {formatTime(time)}
        </span>
      </div>
    </header>
  );
}
