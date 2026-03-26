import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Settings, Users, Shield } from "lucide-react";
import Link from "next/link";

export default function ConfiguracionPage() {
  return (
    <>
      <TopBar title="Configuración" icon={<Settings size={22} />} />
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-4 max-w-2xl">
          <Link href="/configuracion/usuarios">
            <Card className="!p-5 cursor-pointer hover:border-[#F46800]/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Users size={24} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Gestión de Usuarios</h3>
                  <p className="text-gray-500 text-sm">Crear, editar y administrar usuarios y roles del sistema</p>
                </div>
              </div>
            </Card>
          </Link>

          <Card className="!p-5 opacity-50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Shield size={24} className="text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold">Integraciones</h3>
                <p className="text-gray-500 text-sm">APIs, webhooks y conexiones externas — próximamente</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
