"use client";

import type { InfraSiteSummary, InfraProblem } from "@/types/zabbix";

interface Props {
  sites: InfraSiteSummary[];
  problems: InfraProblem[];
  selectedSite: string | null;
  onSelectSite: (site: string | null) => void;
}

export function MapaSitios({ sites, problems, selectedSite, onSelectSite }: Props) {
  if (sites.length === 0) return null;

  // Build set of sites with HIGH/DISASTER problems
  const sitesWithHighProblems = new Set<string>();
  for (const p of problems) {
    if (p.severity === "high" || p.severity === "disaster") {
      sitesWithHighProblems.add(p.site);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Mapa de Sitios</h3>
        {selectedSite && (
          <button
            onClick={() => onSelectSite(null)}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-wuipi-accent/10 text-wuipi-accent border border-wuipi-accent/20"
          >
            Todos
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
        {sites.map((site) => {
          const hasDown = site.hostsDown > 0;
          const hasWarning = site.hostsWarning > 0;
          const hasHighProblem = sitesWithHighProblems.has(site.code);
          const borderColor = hasDown
            ? "border-l-red-500"
            : hasWarning
            ? "border-l-amber-500"
            : "border-l-emerald-500";
          const isSelected = selectedSite === site.code;

          // Status bar proportions
          const upPct = site.totalHosts > 0 ? (site.hostsUp / site.totalHosts) * 100 : 0;
          const downPct = site.totalHosts > 0 ? (site.hostsDown / site.totalHosts) * 100 : 0;

          return (
            <button
              key={site.code}
              onClick={() => onSelectSite(isSelected ? null : site.code)}
              className={`relative text-left p-3 rounded-xl border border-l-4 transition-all ${borderColor} ${
                isSelected
                  ? "bg-wuipi-accent/10 border-wuipi-accent/30"
                  : "bg-wuipi-card hover:bg-wuipi-card-hover border-wuipi-border"
              }`}
            >
              {/* Pulsing red dot for HIGH problems */}
              {hasHighProblem && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}

              <p className="text-sm font-bold text-white">{site.code}</p>

              {/* Mini status bar */}
              <div className="mt-1.5 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                {upPct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${upPct}%` }} />}
                {downPct > 0 && <div className="h-full bg-red-500" style={{ width: `${downPct}%` }} />}
              </div>

              {/* Status text */}
              <div className="mt-1.5">
                {hasDown ? (
                  <p className="text-[10px] font-bold text-red-400">{site.hostsDown} caido{site.hostsDown > 1 ? "s" : ""}</p>
                ) : (
                  <p className="text-[10px] text-gray-500">{site.hostsUp}/{site.totalHosts} online</p>
                )}
              </div>

              {/* Latency */}
              {site.avgLatency !== null && (
                <p className={`text-[10px] mt-0.5 ${
                  site.avgLatency > 15 ? "text-red-400" : site.avgLatency > 5 ? "text-amber-400" : "text-gray-500"
                }`}>
                  Lat: {site.avgLatency}ms
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
