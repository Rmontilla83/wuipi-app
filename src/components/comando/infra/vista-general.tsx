"use client";

import { KPICard } from "@/components/ui/kpi-card";
import { ScoreRing } from "@/components/dashboard";
import { Card } from "@/components/ui/card";
import type { InfraOverview } from "@/types/zabbix";
import { Server, Wifi, WifiOff, AlertTriangle, Activity, Shield } from "lucide-react";

interface Props {
  overview: InfraOverview | null;
}

export function VistaGeneral({ overview }: Props) {
  const o = overview;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Vista General</h3>
      <div className="grid grid-cols-6 gap-3">
        <KPICard label="Total Hosts" value={o?.totalHosts?.toString() || "0"} icon={Server} color="cyan" />
        <KPICard label="En linea" value={o?.hostsUp?.toString() || "0"} icon={Wifi} color="emerald" />
        <KPICard label="Caidos" value={o?.hostsDown?.toString() || "0"} icon={WifiOff} color={o && o.hostsDown > 0 ? "red" : "emerald"} />
        <KPICard label="Con warnings" value={o?.hostsUnknown?.toString() || "0"} icon={AlertTriangle} color="amber" />
        <KPICard label="Uptime" value={o ? `${o.uptimePercent}%` : "—"} icon={Activity} color="emerald" />
        <KPICard label="Problemas" value={o?.totalProblems?.toString() || "0"} icon={Shield} color={o && o.totalProblems > 0 ? "amber" : "emerald"} />
      </div>

      {/* Health score + severity badges */}
      {o && (
        <Card className="!p-4">
          <div className="flex items-center gap-6">
            <ScoreRing score={o.healthScore} size={72} />
            <div>
              <p className="text-sm font-bold text-white mb-2">Health Score</p>
              <div className="flex gap-2 flex-wrap">
                {o.problemsBySeverity.high > 0 && (
                  <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full text-xs font-bold">
                    {o.problemsBySeverity.high} HIGH
                  </span>
                )}
                {o.problemsBySeverity.disaster > 0 && (
                  <span className="px-2 py-0.5 bg-red-500/10 text-red-300 rounded-full text-xs font-bold">
                    {o.problemsBySeverity.disaster} DISASTER
                  </span>
                )}
                {o.problemsBySeverity.average > 0 && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full text-xs font-bold">
                    {o.problemsBySeverity.average} AVERAGE
                  </span>
                )}
                {o.problemsBySeverity.warning > 0 && (
                  <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded-full text-xs font-bold">
                    {o.problemsBySeverity.warning} WARNING
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
