"use client";

import { TopBar } from "@/components/layout/topbar";
import CRMCobranzasTab from "@/components/crm-cobranzas/crm-cobranzas-tab";

export default function CobranzasPage() {
  return (
    <>
      <TopBar title="CRM Cobranzas" subtitle="Gestión de cobranzas y recuperación de clientes" />
      <div className="p-4 md:p-6">
        <CRMCobranzasTab />
      </div>
    </>
  );
}
