"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import CRMCobranzasTab from "@/components/crm-cobranzas/crm-cobranzas-tab";
import CampaignsTab from "@/components/crm-cobranzas/campaigns-tab";
import SegmentsTab from "@/components/crm-cobranzas/segments-tab";
import PaymentsReceivedTab from "@/components/crm-cobranzas/payments-received-tab";
import GatewayLogsTab from "@/components/crm-cobranzas/gateway-logs-tab";
import SyncOdooTab from "@/components/crm-cobranzas/sync-odoo-tab";
import WAOutboxTab from "@/components/crm-cobranzas/wa-outbox-tab";
import { Target, Users, Wrench } from "lucide-react";

// Estructura nueva (2026-05-15): tres grupos top-level + sub-tabs.
// Reemplaza la lista plana de 8 tabs anterior. La idea es separar lo
// OPERATIVO (Cobranza), lo de GESTIÓN (Casos + Pagos), y lo de DIAGNÓSTICO
// (Logs + Sync + WA Outbox experimental).
//
// Tab "Cartera" eliminado — Segmentos cumple la misma función con filtros
// más potentes. El componente CarteraTab queda en el repo por si volvemos.

type Group = "cobranza" | "gestion" | "diagnostico";
type Tab =
  | "segmentos" | "campanas"
  | "casos" | "pagos"
  | "logs" | "sync" | "wa";

interface TabDef {
  id: Tab;
  label: string;
}

const GROUPS: Array<{ id: Group; label: string; icon: typeof Target; tabs: TabDef[]; defaultTab: Tab }> = [
  {
    id: "cobranza",
    label: "Cobranza",
    icon: Target,
    defaultTab: "segmentos",
    tabs: [
      { id: "segmentos", label: "Segmentos" },
      { id: "campanas",  label: "Campañas de Cobro" },
    ],
  },
  {
    id: "gestion",
    label: "Gestión",
    icon: Users,
    defaultTab: "casos",
    tabs: [
      { id: "casos", label: "Casos (Kanban)" },
      { id: "pagos", label: "Pagos Recibidos" },
    ],
  },
  {
    id: "diagnostico",
    label: "Diagnóstico",
    icon: Wrench,
    defaultTab: "logs",
    tabs: [
      { id: "logs", label: "Logs Pasarelas" },
      { id: "sync", label: "Sync Odoo" },
      { id: "wa",   label: "WA Outbox" },
    ],
  },
];

export default function CobranzasPage() {
  const [group, setGroup] = useState<Group>("cobranza");
  const [tab, setTab] = useState<Tab>("segmentos");

  const currentGroup = GROUPS.find((g) => g.id === group)!;
  const handleGroupChange = (gid: Group) => {
    const g = GROUPS.find((x) => x.id === gid)!;
    setGroup(gid);
    setTab(g.defaultTab);
  };

  return (
    <>
      <TopBar title="Cobranzas" subtitle="Gestión de cobranzas, pagos y observabilidad" />
      {/* flex-1 + overflow-auto: el dashboard layout pone overflow-hidden en
          <main> y delega el scroll al contenido de cada página. Sin esto, tabs
          con contenido alto (ej. segmentos editor) se cortan sin scroll. */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* Grupo top-level — visualmente diferente de los sub-tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const active = group === g.id;
            return (
              <button
                key={g.id}
                onClick={() => handleGroupChange(g.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? "bg-[#F46800] text-white"
                    : "bg-wuipi-card border border-wuipi-border text-gray-400 hover:text-white hover:border-[#F46800]/40"
                }`}
              >
                <Icon size={14} />
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tabs del grupo activo */}
        <div className="flex items-center gap-1 mb-4 border-b border-wuipi-border overflow-x-auto">
          {currentGroup.tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-[#F46800] text-[#F46800]"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenido del tab activo */}
        {tab === "segmentos" && <SegmentsTab />}
        {tab === "campanas" && <CampaignsTab />}
        {tab === "casos" && <CRMCobranzasTab />}
        {tab === "pagos" && <PaymentsReceivedTab />}
        {tab === "logs" && <GatewayLogsTab />}
        {tab === "sync" && <SyncOdooTab />}
        {tab === "wa" && <WAOutboxTab />}
      </div>
    </>
  );
}
