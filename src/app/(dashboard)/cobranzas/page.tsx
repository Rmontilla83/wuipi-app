"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import CRMCobranzasTab from "@/components/crm-cobranzas/crm-cobranzas-tab";
import CampaignsTab from "@/components/crm-cobranzas/campaigns-tab";

type Tab = "casos" | "campanas";

export default function CobranzasPage() {
  const [tab, setTab] = useState<Tab>("campanas");

  return (
    <>
      <TopBar title="CRM Cobranzas" subtitle="Gestión de cobranzas y cobros masivos" />
      <div className="p-4 md:p-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-wuipi-border">
          <button
            onClick={() => setTab("campanas")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "campanas"
                ? "border-[#F46800] text-[#F46800]"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            Campañas de Cobro
          </button>
          <button
            onClick={() => setTab("casos")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "casos"
                ? "border-[#F46800] text-[#F46800]"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            Gestión de Casos
          </button>
        </div>

        {tab === "campanas" ? <CampaignsTab /> : <CRMCobranzasTab />}
      </div>
    </>
  );
}
