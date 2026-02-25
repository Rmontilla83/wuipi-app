"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  TrendingUp, Users, Phone, Megaphone, BarChart3,
  Clock, Target, DollarSign, UserPlus,
} from "lucide-react";

type Tab = "pipeline" | "leads" | "actividades" | "campanas" | "reportes";

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

export default function VentasPage() {
  const [tab, setTab] = useState<Tab>("pipeline");

  const tabs: { id: Tab; label: string; icon: any; description: string; phase: string }[] = [
    {
      id: "pipeline", label: "Pipeline", icon: Target,
      description: "Vista Kanban de oportunidades comerciales. Desde lead nuevo hasta instalación activa, con scoring automático y auto-follow-up.",
      phase: "Phase 10A"
    },
    {
      id: "leads", label: "Leads", icon: UserPlus,
      description: "Lista de prospectos con origen, scoring por zona y cobertura, y conversión automática a cliente al aprobar instalación.",
      phase: "Phase 10A"
    },
    {
      id: "actividades", label: "Actividades", icon: Phone,
      description: "Llamadas, visitas técnicas de factibilidad, seguimientos programados y recordatorios automáticos.",
      phase: "Phase 10B"
    },
    {
      id: "campanas", label: "Campañas", icon: Megaphone,
      description: "Tracking de campañas activas (redes sociales, referidos, alianzas), métricas de rendimiento por canal.",
      phase: "Phase 10C"
    },
    {
      id: "reportes", label: "Reportes", icon: BarChart3,
      description: "Tasa de conversión, ciclo de venta promedio, revenue por vendedor, MRR (Monthly Recurring Revenue).",
      phase: "Phase 10D"
    },
  ];

  const currentTab = tabs.find(t => t.id === tab)!;

  return (
    <>
      <TopBar title="CRM de Ventas" icon={<TrendingUp size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (
            <TabButton key={t.id} tab={t.id} current={tab} icon={t.icon} label={t.label} onClick={setTab} />
          ))}
        </div>

        {/* Tab Content — Placeholder */}
        <Card className="bg-wuipi-card border-wuipi-border p-12 text-center">
          <currentTab.icon size={48} className="mx-auto mb-4 text-gray-600" />
          <h3 className="text-lg font-semibold text-white mb-2">{currentTab.label}</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto">{currentTab.description}</p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
            <Clock size={12} /> Próximamente — {currentTab.phase}
          </div>
        </Card>

        {/* Pipeline Preview */}
        <div className="grid grid-cols-5 gap-3">
          {["Lead Nuevo", "Contactado", "Visita Técnica", "Propuesta", "Aprobado"].map((stage, i) => (
            <Card key={stage} className="bg-wuipi-card border-wuipi-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-gray-400 uppercase">{stage}</h4>
                <span className="text-xs text-gray-600">0</span>
              </div>
              <div className="h-24 border border-dashed border-wuipi-border rounded-lg flex items-center justify-center">
                <span className="text-xs text-gray-600">Sin leads</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
