import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function ConfiguracionPage() {
  return (
    <>
      <TopBar title="Configuración" icon={<Settings size={22} />} />
      <div className="flex-1 overflow-auto p-6">
        <Card className="flex flex-col items-center text-center py-16">
          <span className="text-5xl mb-4">⚙️</span>
          <h2 className="text-2xl font-bold text-white mb-2">Configuración</h2>
          <p className="text-gray-500 max-w-md mb-6">
            Gestión de usuarios, roles RBAC, integraciones API,
            alertas y personalización del sistema.
          </p>
        </Card>
      </div>
    </>
  );
}
