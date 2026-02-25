import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Brain } from "lucide-react";

export default function SupervisorPage() {
  return (
    <>
      <TopBar title="Supervisor IA" icon={<Brain size={22} className="text-wuipi-purple" />} />
      <div className="flex-1 overflow-auto p-6">
        <Card className="flex flex-col items-center text-center py-16">
          <span className="text-5xl mb-4">🧠</span>
          <h2 className="text-2xl font-bold text-white mb-2">Supervisor IA</h2>
          <p className="text-gray-500 max-w-md mb-6">
            COO Virtual — Briefing diario, insights en tiempo real, chat con lenguaje natural.
            Orquestado por Claude + Gemini analizando todos los datos de la operación.
          </p>
          <span className="px-4 py-2 bg-wuipi-purple/10 text-wuipi-purple rounded-lg text-sm font-semibold border border-wuipi-purple/20">
            Integración IA — Próximamente
          </span>
        </Card>
      </div>
    </>
  );
}
