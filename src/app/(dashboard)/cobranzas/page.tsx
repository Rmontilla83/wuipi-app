"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import CRMCobranzasTab from "@/components/crm-cobranzas/crm-cobranzas-tab";
import CampaignsTab from "@/components/crm-cobranzas/campaigns-tab";
import SegmentsTab from "@/components/crm-cobranzas/segments-tab";
import CarteraTab from "@/components/crm-cobranzas/cartera-tab";
import PaymentsReceivedTab from "@/components/crm-cobranzas/payments-received-tab";
import GatewayLogsTab from "@/components/crm-cobranzas/gateway-logs-tab";
import SyncOdooTab from "@/components/crm-cobranzas/sync-odoo-tab";
import WAOutboxTab from "@/components/crm-cobranzas/wa-outbox-tab";

type Tab = "cartera" | "segmentos" | "campanas" | "casos" | "pagos" | "logs" | "sync" | "wa";

export default function CobranzasPage() {
  const [tab, setTab] = useState<Tab>("cartera");

  const tabs: { id: Tab; label: string }[] = [
    { id: "cartera",   label: "Cartera" },
    { id: "segmentos", label: "Segmentos" },
    { id: "campanas",  label: "Campañas de Cobro" },
    { id: "casos",     label: "Gestión de Casos" },
    { id: "pagos",     label: "Pagos Recibidos" },
    { id: "logs",      label: "Logs Pasarelas" },
    { id: "sync",      label: "Sync Odoo" },
    { id: "wa",        label: "WA Outbox" },
  ];

  return (
    <>
      <TopBar title="Cobranzas" subtitle="Gestión de cobranzas, pagos y observabilidad" />
      {/* flex-1 + overflow-auto: el dashboard layout pone overflow-hidden en
          <main> y delega el scroll al contenido de cada página. Sin esto, tabs
          con contenido alto (ej. segmentos editor) se cortan sin scroll. */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-wuipi-border overflow-x-auto">
          {tabs.map((t) => (
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

        {tab === "cartera" && (
          <CarteraTab onCampaignCreated={() => setTab("campanas")} />
        )}
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
