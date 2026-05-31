import { getCallerProfile } from "@/lib/auth/check-permission";
import { CobranzasHeader } from "@/components/cobranzas/header";
import { TransaccionesView } from "@/components/cobranzas/transacciones-view";

export const dynamic = "force-dynamic";

export default async function TransaccionesPage() {
  // El layout ya garantizó que hay caller con permiso cobranzas:read.
  const caller = await getCallerProfile();

  return (
    <div className="min-h-screen bg-wuipi-bg flex flex-col">
      <CobranzasHeader userEmail={caller?.email || ""} />
      <main className="flex-1">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Transacciones</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Todas las operaciones registradas por las pasarelas Wuipi · solo lectura
            </p>
          </div>

          <TransaccionesView />
        </div>
      </main>
    </div>
  );
}
