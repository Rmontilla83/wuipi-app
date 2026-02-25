import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Radio } from "lucide-react";

export default function InfraestructuraPage() {
  return (
    <>
      <TopBar title="Infraestructura" icon={<Radio size={22} />} />
      <div className="flex-1 overflow-auto p-6">
        <Card className="flex flex-col items-center text-center py-16">
          <span className="text-5xl mb-4">📡</span>
          <h2 className="text-2xl font-bold text-white mb-2">Infraestructura</h2>
          <p className="text-gray-500 max-w-md mb-6">
            Conexión PRTG, mapa topológico de red, monitoreo en tiempo real,
            alertas inteligentes y predicción de fallas.
          </p>
          <span className="px-4 py-2 bg-amber-500/10 text-amber-400 rounded-lg text-sm font-semibold border border-amber-500/20">
            Fase 2 — Próximamente
          </span>
        </Card>
      </div>
    </>
  );
}
