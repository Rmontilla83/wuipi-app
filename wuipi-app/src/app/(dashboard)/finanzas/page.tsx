import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

export default function FinanzasPage() {
  return (
    <>
      <TopBar title="Finanzas" icon={<DollarSign size={22} />} />
      <div className="flex-1 overflow-auto p-6">
        <Card className="flex flex-col items-center text-center py-16">
          <span className="text-5xl mb-4">💰</span>
          <h2 className="text-2xl font-bold text-white mb-2">Finanzas</h2>
          <p className="text-gray-500 max-w-md mb-6">
            Facturación fiscal SENIAT, multi-moneda BCV, cobranza automatizada,
            reportes contables y cumplimiento tributario venezolano.
          </p>
          <span className="px-4 py-2 bg-amber-500/10 text-amber-400 rounded-lg text-sm font-semibold border border-amber-500/20">
            Fase 4 — Próximamente
          </span>
        </Card>
      </div>
    </>
  );
}
