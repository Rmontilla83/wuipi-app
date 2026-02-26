"use client";

import { Card } from "@/components/ui/card";
import { Radio, Wifi } from "lucide-react";
import type { APClient } from "@/types/zabbix";

interface Props {
  clients: APClient[];
}

export function APClientsList({ clients }: Props) {
  const totalClients = clients.reduce((sum, ap) => sum + ap.clients, 0);
  const maxClients = Math.max(...clients.map((c) => c.clients), 1);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Wifi size={24} className="text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Clientes Wireless</p>
              <p className="text-3xl font-bold text-white">{totalClients}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">APs Activos</p>
            <p className="text-2xl font-bold text-violet-400">
              {clients.filter((c) => c.clients > 0).length}
              <span className="text-sm text-gray-500 font-normal"> / {clients.length}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Per-AP list */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Radio size={16} /> Clientes por Access Point
        </h3>
        <div className="space-y-3">
          {clients.map((ap) => (
            <div key={ap.hostId} className="flex items-center gap-3">
              <Radio size={16} className={ap.clients > 0 ? "text-violet-400" : "text-gray-600"} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">{ap.hostName}</span>
                  <span className="text-xs text-gray-500 ml-2">{ap.ip}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-3 bg-wuipi-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        ap.clients === 0 ? "bg-gray-600" : ap.clients > 25 ? "bg-amber-500" : "bg-violet-500"
                      }`}
                      style={{ width: `${(ap.clients / maxClients) * 100}%`, minWidth: ap.clients > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-10 text-right ${
                    ap.clients === 0 ? "text-gray-600" : "text-white"
                  }`}>
                    {ap.clients}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">Sin datos de Access Points</p>
          )}
        </div>
      </Card>
    </div>
  );
}
