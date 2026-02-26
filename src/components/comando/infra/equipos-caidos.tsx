"use client";

import type { InfraHost } from "@/types/zabbix";

interface Props {
  hosts: InfraHost[];
}

export function EquiposCaidos({ hosts }: Props) {
  const down = hosts.filter((h) => h.status === "offline");

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
        Equipos Caidos ({down.length})
      </h3>

      {down.length === 0 ? (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
          <p className="text-sm text-emerald-400 font-medium">Todos los equipos en linea</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {down.map((host) => (
            <div
              key={host.id}
              className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl"
            >
              <p className="text-sm font-bold text-red-400 truncate">{host.name}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                <p>Tipo: <span className="text-gray-400">{host.detailedTypeLabel}</span></p>
                <p>Sitio: <span className="text-gray-400">{host.site}</span></p>
                <p>IP: <span className="text-gray-400 font-mono">{host.ip}</span></p>
                {host.error && (
                  <p className="text-red-400/70 truncate">{host.error}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
