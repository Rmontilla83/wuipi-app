import { FileQuestion } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-gray-500/10 border border-gray-500/20 flex items-center justify-center mx-auto mb-6">
          <FileQuestion size={32} className="text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Página no encontrada</h2>
        <p className="text-sm text-gray-400 mb-6">
          La ruta que buscas no existe o fue movida.
        </p>
        <a
          href="/comando"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-wuipi-accent text-white hover:bg-wuipi-accent/90 transition-colors"
        >
          Ir al Centro de Comando
        </a>
      </div>
    </div>
  );
}
