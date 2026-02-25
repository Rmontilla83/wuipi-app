import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing, StatusBadge, LoadBar } from "@/components/dashboard";
import { Target } from "lucide-react";

// Mock data — will be replaced by Supabase queries + API integrations
const MODULE_SCORES = [
  { label: "Red", icon: "📡", score: 94, status: "operational" as const, trend: "+2.1%" },
  { label: "Soporte", icon: "🎧", score: 78, status: "warning" as const, trend: "-5.3%" },
  { label: "Finanzas", icon: "💰", score: 91, status: "operational" as const, trend: "+8.7%" },
  { label: "Clientes", icon: "👥", score: 96, status: "operational" as const, trend: "+3.2%" },
];

const NETWORK_NODES = [
  { name: "OLT Lechería-Norte", status: "degraded" as const, clients: 245, uptime: "99.1%", load: 72 },
  { name: "OLT Lechería-Sur", status: "online" as const, clients: 189, uptime: "99.9%", load: 45 },
  { name: "OLT Barcelona-Centro", status: "online" as const, clients: 312, uptime: "99.8%", load: 61 },
  { name: "OLT Barcelona-Sur", status: "warning" as const, clients: 198, uptime: "99.5%", load: 87 },
  { name: "OLT Puerto La Cruz", status: "online" as const, clients: 276, uptime: "99.7%", load: 53 },
  { name: "Core Router Principal", status: "online" as const, clients: null, uptime: "99.99%", load: 34 },
];

const ALERTS = [
  { id: 1, type: "critical", msg: "OLT Lechería-Norte: latencia >150ms", time: "Hace 3 min" },
  { id: 2, type: "warning", msg: "12 tickets sin asignar desde hace >2h", time: "Hace 15 min" },
  { id: 3, type: "info", msg: "Conciliación bancaria completada", time: "Hace 1h" },
  { id: 4, type: "warning", msg: "Barcelona-Sur al 87% de capacidad", time: "Hace 2h" },
  { id: 5, type: "critical", msg: "5 clientes zona Lechería sin servicio", time: "Hace 5 min" },
];

const ACTIVITY = [
  { action: "Ticket #4521 resuelto", user: "Carlos M.", module: "soporte", time: "Hace 5 min" },
  { action: "Pago recibido - Cliente #892", user: "Sistema", module: "finanzas", time: "Hace 12 min" },
  { action: "OLT Lechería-Norte reiniciado", user: "José R.", module: "infra", time: "Hace 18 min" },
  { action: "Nuevo cliente - Plan 50Mbps", user: "Ana L.", module: "ventas", time: "Hace 25 min" },
  { action: "Falla masiva zona norte", user: "PRTG", module: "infra", time: "Hace 30 min" },
];

const alertStyles = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-400" },
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-400" },
  info: { bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-400" },
};

const moduleColors: Record<string, string> = {
  soporte: "bg-cyan-400",
  finanzas: "bg-emerald-400",
  infra: "bg-amber-400",
  ventas: "bg-violet-400",
};

export default function ComandoPage() {
  return (
    <>
      <TopBar title="Centro de Comando" icon={<Target size={22} />} />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Module Score Cards */}
        <div className="grid grid-cols-4 gap-4">
          {MODULE_SCORES.map((m) => (
            <Card key={m.label} hover className="flex items-center gap-4">
              <ScoreRing score={m.score} size={68} />
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  {m.icon} {m.label}
                </p>
                <StatusBadge status={m.status} />
                <p
                  className={`text-xs font-semibold mt-1.5 ${
                    m.trend.startsWith("+") ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {m.trend} vs ayer
                </p>
              </div>
            </Card>
          ))}
        </div>

        {/* Network + Alerts Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Network Nodes */}
          <Card>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-bold text-white">📡 Estado de Red</h3>
              <span className="text-xs text-gray-500">PRTG Live</span>
            </div>
            <div className="space-y-3">
              {NETWORK_NODES.map((node) => (
                <div
                  key={node.name}
                  className="p-3 bg-wuipi-bg rounded-xl border border-wuipi-border"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold text-white">{node.name}</span>
                    <StatusBadge status={node.status} />
                  </div>
                  <LoadBar value={node.load} />
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    {node.clients && <span>👥 {node.clients}</span>}
                    <span>⬆ {node.uptime}</span>
                    <span>📊 {node.load}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Alerts */}
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-white">🔔 Alertas</h3>
              <span className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-full text-xs font-bold">
                {ALERTS.filter((a) => a.type === "critical").length} críticas
              </span>
            </div>
            <div className="space-y-2">
              {ALERTS.map((alert) => {
                const style = alertStyles[alert.type as keyof typeof alertStyles];
                return (
                  <div
                    key={alert.id}
                    className={`p-3 ${style.bg} border ${style.border} rounded-xl flex items-start gap-3`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${style.dot} mt-1.5 shrink-0 shadow-[0_0_6px] shadow-current`}
                    />
                    <div>
                      <p className="text-sm text-white">{alert.msg}</p>
                      <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Bottom Row: Finance + Tickets + Activity */}
        <div className="grid grid-cols-3 gap-4">
          {/* Finance */}
          <Card>
            <h3 className="text-base font-bold text-white mb-4">💰 Finanzas</h3>
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">MRR</p>
              <p className="text-3xl font-bold text-cyan-400">
                $12,450
                <span className="text-sm font-normal text-gray-500 ml-1">USD</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Cobranza", value: "89%", color: "text-emerald-400" },
                { label: "Morosos", value: "47", color: "text-red-400" },
                { label: "Churn", value: "2.1%", color: "text-amber-400" },
                { label: "ARPU", value: "$18.5", color: "text-white" },
              ].map((m) => (
                <div key={m.label} className="p-3 bg-wuipi-bg rounded-lg">
                  <p className="text-xs text-gray-500">{m.label}</p>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Tickets */}
          <Card>
            <h3 className="text-base font-bold text-white mb-4">🎫 Tickets Hoy</h3>
            <p className="text-3xl font-bold text-white mb-1">
              153
              <span className="text-sm font-normal text-gray-500 ml-2">tickets</span>
            </p>
            <p className="text-xs font-semibold text-amber-400 mb-4">
              ⏱ Resolución prom: 2.4h
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Abiertos", value: "23", color: "text-cyan-400" },
                { label: "En progreso", value: "18", color: "text-amber-400" },
                { label: "Resueltos", value: "112", color: "text-emerald-400" },
                { label: "Sin asignar", value: "12", color: "text-red-400" },
              ].map((m) => (
                <div key={m.label} className="p-3 bg-wuipi-bg rounded-lg">
                  <p className="text-xs text-gray-500">{m.label}</p>
                  <p className={`text-lg font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Activity Feed */}
          <Card>
            <h3 className="text-base font-bold text-white mb-4">⚡ Actividad</h3>
            <div className="space-y-3">
              {ACTIVITY.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      moduleColors[item.module] || "bg-gray-500"
                    }`}
                  />
                  <div>
                    <p className="text-sm text-white leading-tight">{item.action}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.user} · {item.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
