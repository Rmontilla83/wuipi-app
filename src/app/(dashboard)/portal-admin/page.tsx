"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Globe, MessageSquare, Bot, BarChart3, Settings,
  Clock, ArrowRight, Zap, Users, Headphones,
  TrendingUp, DollarSign, HelpCircle, User,
} from "lucide-react";

type Tab = "conversaciones" | "ia-config" | "estadisticas" | "config";

function TabButton({ tab, current, icon: Icon, label, onClick }: {
  tab: Tab; current: Tab; icon: any; label: string; onClick: (t: Tab) => void;
}) {
  const active = tab === current;
  return (
    <button
      onClick={() => onClick(tab)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
        active
          ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20"
          : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

const INTENT_ROUTES = [
  { intent: "Soporte Técnico", icon: Headphones, target: "CRM Soporte", color: "text-blue-400 bg-blue-400/10", description: "Problemas de conexión, lentitud, equipos" },
  { intent: "Consulta de Factura", icon: DollarSign, target: "Facturación", color: "text-emerald-400 bg-emerald-400/10", description: "Estado de cuenta, pagos, mora" },
  { intent: "Cambiar Plan", icon: TrendingUp, target: "CRM Ventas", color: "text-purple-400 bg-purple-400/10", description: "Upgrade, downgrade, nuevos servicios" },
  { intent: "Consulta General", icon: HelpCircle, target: "IA Auto-responde", color: "text-amber-400 bg-amber-400/10", description: "FAQ, horarios, cobertura" },
  { intent: "Hablar con Humano", icon: User, target: "Cola en Vivo", color: "text-red-400 bg-red-400/10", description: "Escala a agente disponible" },
];

export default function PortalAdminPage() {
  const [tab, setTab] = useState<Tab>("conversaciones");

  return (
    <>
      <TopBar title="Portal de Clientes" icon={<Globe size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <TabButton tab="conversaciones" current={tab} icon={MessageSquare} label="Conversaciones" onClick={setTab} />
          <TabButton tab="ia-config" current={tab} icon={Bot} label="Config IA" onClick={setTab} />
          <TabButton tab="estadisticas" current={tab} icon={BarChart3} label="Estadísticas" onClick={setTab} />
          <TabButton tab="config" current={tab} icon={Settings} label="Configuración" onClick={setTab} />
        </div>

        {/* Conversaciones Tab */}
        {tab === "conversaciones" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <MessageSquare size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Centro de Conversaciones</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Aquí verás todas las conversaciones de clientes en tiempo real. 
              La IA clasifica cada mensaje y redirige al módulo correcto automáticamente.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente
            </div>
          </Card>
        )}

        {/* IA Config Tab */}
        {tab === "ia-config" && (
          <div className="space-y-4">
            <Card className="bg-wuipi-card border-wuipi-border p-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Zap size={16} className="text-wuipi-purple" /> Routing por Intención
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                La IA del portal analiza cada mensaje del cliente y lo redirige automáticamente al módulo correcto.
              </p>
              <div className="space-y-3">
                {INTENT_ROUTES.map(route => (
                  <div key={route.intent} className="flex items-center gap-4 p-3 rounded-lg bg-wuipi-bg border border-wuipi-border">
                    <div className={`p-2 rounded-lg ${route.color}`}>
                      <route.icon size={18} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{route.intent}</p>
                      <p className="text-xs text-gray-500">{route.description}</p>
                    </div>
                    <ArrowRight size={14} className="text-gray-600" />
                    <span className="text-xs font-medium text-gray-400 bg-wuipi-card px-3 py-1.5 rounded-lg">
                      {route.target}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
              <Bot size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-semibold text-white mb-2">Configuración del Asistente IA</h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto">
                Personaliza el tono, las respuestas predeterminadas, el FAQ automático 
                y las reglas de escalamiento del chat inteligente.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
                <Clock size={12} /> Próximamente
              </div>
            </Card>
          </div>
        )}

        {/* Estadísticas Tab */}
        {tab === "estadisticas" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <BarChart3 size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Estadísticas del Portal</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Conversaciones por día, intenciones más frecuentes, tasa de resolución por IA, 
              tiempo de respuesta y satisfacción del cliente.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente
            </div>
          </Card>
        )}

        {/* Config Tab */}
        {tab === "config" && (
          <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
            <Settings size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-lg font-semibold text-white mb-2">Configuración del Portal</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Widget embebible para wuipi.com.ve, autenticación de clientes, 
              notificaciones push y personalización visual.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              <Clock size={12} /> Próximamente
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
