"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import CRMCobranzasTab from "@/components/crm-cobranzas/crm-cobranzas-tab";
import CampaignsTab from "@/components/crm-cobranzas/campaigns-tab";
import CarteraTab from "@/components/crm-cobranzas/cartera-tab";

type Tab = "cartera" | "campanas" | "casos";

export default function CobranzasPage() {
  const [tab, setTab] = useState<Tab>("cartera");

  const tabs: { id: Tab; label: string }[] = [
    { id: "cartera", label: "Cartera" },
    { id: "campanas", label: "Campañas de Cobro" },
    { id: "casos", label: "Gestión de Casos" },
  ];

  return (
    <>
      <TopBar title="CRM Cobranzas" subtitle="Gestión de cobranzas y cobros masivos" />
      <div className="p-4 md:p-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-wuipi-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
        {tab === "campanas" && <CampaignsTab />}
        {tab === "casos" && <CRMCobranzasTab />}
      </div>
    </>
  );
}
