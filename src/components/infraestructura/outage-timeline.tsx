"use client";

import { Card } from "@/components/ui/card";
import { History, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { OutageEvent, SeverityLevel } from "@/types/zabbix";

interface Props {
  events: OutageEvent[];
  period: string;
  onPeriodChange: (period: string) => void;
}

const SEVERITY_COLORS: Record<SeverityLevel, { dot: string; text: string; bg: string }> = {
  disaster:       { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  high:           { dot: "bg-orange-500", text: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  average:        { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  warning:        { dot: "bg-yellow-500", text: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  information:    { dot: "bg-blue-500", text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  not_classified: { dot: "bg-gray-500", text: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/30" },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

const PERIOD_OPTIONS = [
  { key: "24h", label: "24 horas" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
];

export function OutageTimeline({ events, period, onPeriodChange }: Props) {
  const activeEvents = events.filter((e) => e.active);
  const resolvedEvents = events.filter((e) => !e.active);
  const totalDowntime = events.reduce((sum, e) => sum + e.duration, 0);

  return (
    <div className="space-y-4">
      {/* Period selector + summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/5 border border-red-500/20 rounded-lg">
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-sm font-bold text-red-400">{activeEvents.length}</span>
            <span className="text-xs text-gray-500">activos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-sm font-bold text-emerald-400">{resolvedEvents.length}</span>
            <span className="text-xs text-gray-500">resueltos</span>
          </div>
          <div className="text-xs text-gray-500">
            Tiempo total de caída: <span className="font-bold text-white">{formatDuration(totalDowntime)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 mr-1">Período:</span>
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                period === p.key
                  ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20"
                  : "text-gray-500 hover:text-gray-300 border-transparent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <History size={16} /> Historial de Eventos
        </h3>
        <div className="space-y-1">
          {events.map((event) => {
            const sevConf = SEVERITY_COLORS[event.severity];
            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  event.active
                    ? `${sevConf.bg} bg-opacity-20`
                    : "bg-wuipi-bg border-wuipi-border/50"
                }`}
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-3 h-3 rounded-full ${sevConf.dot} ${event.active ? "animate-pulse" : ""}`} />
                  <div className="w-px h-full bg-wuipi-border/30 mt-1" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-medium ${event.active ? "text-white" : "text-gray-300"}`}>
                      {event.hostName}
                    </span>
                    <div className="flex items-center gap-2">
                      {event.active && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                          ACTIVO
                        </span>
                      )}
                      <span className="text-[10px] text-gray-500 font-mono">
                        {formatDuration(event.duration)}
                      </span>
                    </div>
                  </div>
                  <p className={`text-xs ${event.active ? "text-gray-300" : "text-gray-500"}`}>
                    {event.eventName}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-600">
                    <span>Inicio: {new Date(event.startTime).toLocaleString("es-VE")}</span>
                    {event.endTime && (
                      <span>Fin: {new Date(event.endTime).toLocaleString("es-VE")}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-sm text-gray-500">Sin eventos en este período</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
