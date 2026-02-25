import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Headphones } from "lucide-react";

export default function SoportePage() {
  return (
    <>
      <TopBar title="Soporte" icon={<Headphones size={22} />} />
      <div className="flex-1 overflow-auto p-6">
        <Card className="flex flex-col items-center text-center py-16">
          <span className="text-5xl mb-4">🎧</span>
          <h2 className="text-2xl font-bold text-white mb-2">Soporte</h2>
          <p className="text-gray-500 max-w-md mb-6">
            Vista 360 de tickets, integración Kommo, métricas SLA,
            mapa de calor de incidencias y detección de patrones.
          </p>
          <span className="px-4 py-2 bg-amber-500/10 text-amber-400 rounded-lg text-sm font-semibold border border-amber-500/20">
            Fase 3 — Próximamente
          </span>
        </Card>
      </div>
    </>
  );
}
