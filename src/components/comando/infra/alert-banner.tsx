"use client";

import type { InfraHost } from "@/types/zabbix";
import { AlertTriangle } from "lucide-react";

interface Props {
  hosts: InfraHost[];
}

function formatTimeAgo(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days}d`;
  const months = Math.floor(days / 30);
  return `hace ${months} meses`;
}

export function AlertBanner({ hosts }: Props) {
  const down = hosts.filter((h) => h.status === "offline");
  if (down.length === 0) return null;

  return (
    <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={18} className="text-red-400 shrink-0" />
        <span className="text-sm font-bold text-red-400">
          {down.length} equipo{down.length > 1 ? "s" : ""} caido{down.length > 1 ? "s" : ""}
        </span>
      </div>
      <p className="text-xs text-red-400/80 leading-relaxed">
        {down.map((h, i) => (
          <span key={h.id}>
            {i > 0 && <span className="text-red-400/40"> · </span>}
            <span className="font-medium text-red-300">{h.name}</span>
            {h.uptime !== null && h.uptime === 0 && h.latency === null && (
              <span className="text-red-400/60"> ({formatTimeAgo(h.uptime)})</span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
