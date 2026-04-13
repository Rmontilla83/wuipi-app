"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import {
  TrendingUp, TicketCheck, MessageSquare,
} from "lucide-react";
import CRMVentasTab from "@/components/crm-ventas/crm-ventas-tab";
import InboxView from "@/components/inbox/inbox-view";

type MainTab = "crm" | "inbox";

export default function VentasPage() {
  const [mainTab, setMainTab] = useState<MainTab>("crm");

  return (
    <>
      <TopBar title="CRM Ventas" icon={<TrendingUp size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Main Tabs */}
        <div className="flex items-center gap-2">
          <button onClick={() => setMainTab("crm")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              mainTab === "crm" ? "bg-wuipi-accent/10 text-wuipi-accent border-wuipi-accent/20" : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
            }`}>
            <TicketCheck size={16} /> Pipeline
          </button>
          <button onClick={() => setMainTab("inbox")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              mainTab === "inbox" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "text-gray-500 hover:text-gray-300 border-transparent hover:bg-wuipi-card-hover"
            }`}>
            <MessageSquare size={16} /> Inbox
          </button>
        </div>

        {mainTab === "crm" && <CRMVentasTab />}
        {mainTab === "inbox" && <InboxView />}
      </div>
    </>
  );
}
