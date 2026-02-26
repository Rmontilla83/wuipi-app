"use client";

import type { InfraSiteSummary } from "@/types/zabbix";

interface Props {
  sites: InfraSiteSummary[];
  selectedSite: string | null;
  onSelectSite: (site: string | null) => void;
}

export function MapaSitios({ sites, selectedSite, onSelectSite }: Props) {
  if (sites.length === 0) return null;

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
          const borderColor = hasDown
            ? "border-l-red-500"
            : hasWarning
            ? "border-l-amber-500"
            : "border-l-emerald-500";
          const isSelected = selectedSite === site.code;

          return (
            <button
              key={site.code}
              onClick={() => onSelectSite(isSelected ? null : site.code)}
              className={`text-left p-3 rounded-xl border border-l-4 transition-all ${borderColor} ${
                isSelected
                  ? "bg-wuipi-accent/10 border-wuipi-accent/30"
                  : "bg-wuipi-card hover:bg-wuipi-card-hover border-wuipi-border"
              }`}
            >
              <p className="text-sm font-bold text-white">{site.code}</p>
              <p className="text-[10px] text-gray-500">{site.totalHosts} equipos</p>
              <div className="flex gap-2 mt-1 text-[10px]">
                <span className="text-emerald-400">{site.hostsUp}</span>
                {site.hostsDown > 0 && <span className="text-red-400">{site.hostsDown}</span>}
                {site.hostsWarning > 0 && <span className="text-amber-400">{site.hostsWarning}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
