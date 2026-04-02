"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePortal } from "@/lib/portal/context";
import { Card } from "@/components/ui/card";
import { Wifi, FileText, Headphones, RefreshCw, ChevronRight, AlertTriangle } from "lucide-react";
import type { OdooClientDetail } from "@/types/odoo";

const fmtBs = (n: number) => `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PortalDashboard() {
  const { partnerId, customerName } = usePortal();
  const [data, setData] = useState<OdooClientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/odoo/clients/${partnerId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [partnerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  const activeSubs = data?.subscriptions.filter((s) => s.state === "3_progress").length || 0;
  const pendingInvoices = data?.invoices.filter((i) => i.amount_due > 0).length || 0;
  const totalDue = data?.credit || 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white">Hola, {customerName.split(" ")[0]}</h1>
        <p className="text-sm text-gray-500">Bienvenido a tu portal de cliente WUIPI</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="!p-4 text-center">
          <Wifi size={20} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-2xl font-bold text-white">{activeSubs}</p>
          <p className="text-[10px] text-gray-500 uppercase">Servicios activos</p>
        </Card>
        <Card className="!p-4 text-center">
          <FileText size={20} className="mx-auto mb-2 text-amber-400" />
          <p className="text-2xl font-bold text-white">{pendingInvoices}</p>
          <p className="text-[10px] text-gray-500 uppercase">Facturas pendientes</p>
        </Card>
        <Card className="!p-4 text-center">
          <AlertTriangle size={20} className={`mx-auto mb-2 ${totalDue > 0 ? "text-red-400" : "text-emerald-400"}`} />
          <p className={`text-2xl font-bold ${totalDue > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {totalDue > 0 ? fmtBs(totalDue) : "Al día"}
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Saldo</p>
        </Card>
      </div>

      {/* Quick links */}
      <div className="space-y-2">
        <QuickLink href="/portal/suscripciones" icon={Wifi} label="Mis suscripciones" desc="Ver planes y solicitar cambios" />
        <QuickLink href="/portal/facturas" icon={FileText} label="Mis facturas" desc="Ver historial y pagar pendientes" />
        <QuickLink href="/portal/ayuda" icon={Headphones} label="Soporte" desc="Crear ticket o contactar soporte" />
      </div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label, desc }: {
  href: string; icon: any; label: string; desc: string;
}) {
  return (
    <Link href={href}>
      <Card hover className="flex items-center gap-4 !p-4">
        <div className="w-10 h-10 rounded-xl bg-wuipi-accent/10 flex items-center justify-center shrink-0">
          <Icon size={20} className="text-wuipi-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium">{label}</p>
          <p className="text-gray-500 text-xs">{desc}</p>
        </div>
        <ChevronRight size={16} className="text-gray-600 shrink-0" />
      </Card>
    </Link>
  );
}
