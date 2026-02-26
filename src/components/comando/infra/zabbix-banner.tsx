"use client";

import { AlertTriangle } from "lucide-react";

export function ZabbixBanner() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
      <AlertTriangle size={20} className="shrink-0" />
      <div>
        <p className="text-sm font-bold">Sin conexion con Zabbix</p>
        <p className="text-xs text-red-400/70">Los datos de infraestructura no estan disponibles</p>
      </div>
    </div>
  );
}
