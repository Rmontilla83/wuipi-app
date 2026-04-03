"use client";

import { useEffect, useState, useCallback } from "react";
import { formatTime } from "@/lib/utils";
import { Wifi, Brain } from "lucide-react";

interface ServiceStats {
  total: number;
  active: number;
  paused: number;
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, icon, actions }: TopBarProps) {
  const [time, setTime] = useState(new Date());
  const [services, setServices] = useState<ServiceStats | null>(null);

  const fetchServices = useCallback(() => {
    fetch("/api/odoo/financial-summary")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.active_services !== undefined) {
          setServices({
            total: (d.active_services || 0) + (d.paused_services || 0),
            active: d.active_services || 0,
            paused: d.paused_services || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    fetchServices();
    return () => clearInterval(timer);
  }, [fetchServices]);

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
