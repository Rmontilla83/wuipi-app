"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Lock, Save, RotateCcw, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROLE_CONFIG,
  OPERATIONAL_MODULES,
  SIDEBAR_ONLY_MODULES,
  OPERATIONAL_ACTIONS,
  MODULE_SIDEBAR_MAP,
} from "@/lib/auth/permissions";
import type { Module, Action } from "@/lib/auth/permissions";

// ============================================================
// Constants
// ============================================================

const EDITABLE_ROLES = [
  "admin", "gerente", "supervisor", "analista_cobranzas",
  "analista_soporte", "finanzas", "soporte", "infraestructura",
  "tecnico", "vendedor",
] as const;

const MODULE_LABELS: Record<string, string> = {
  cobranzas: "Cobranzas",
  soporte: "Soporte",
  ventas: "Ventas",
  mercantil: "Pagos Mercantil",
  clientes: "Clientes",
  configuracion: "Configuración",
  usuarios: "Usuarios",
  auditoria: "Auditoría",
  infraestructura: "Infraestructura",
  erp: "ERP",
  bequant: "Bequant",
  comando: "Centro de Comando",
  supervisor_ia: "Supervisor IA",
  portal_admin: "Portal Clientes",
  actualizaciones: "Actualizaciones",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Crear",
  read: "Leer",
  update: "Editar",
  delete: "Eliminar",
  send: "Enviar",
  export: "Exportar",
  approve: "Aprobar",
  assign: "Asignar",
  access: "Acceso",
};

// ============================================================
// Types
// ============================================================

type PermissionsMap = Record<string, Record<string, string[]>>;

// ============================================================
// Component
// ============================================================

export default function PermisosPage() {
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [original, setOriginal] = useState<PermissionsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current permissions
  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracion/permisos");
      if (!res.ok) throw new Error("Error al cargar permisos");
      const data = await res.json();
      setPermissions(data.permissions);
      setOriginal(JSON.parse(JSON.stringify(data.permissions)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  // Check if there are changes
  const hasChanges = JSON.stringify(permissions) !== JSON.stringify(original);

  // Toggle an action for a role/module
  const toggleAction = (role: string, module: string, action: string) => {
    setPermissions((prev) => {
      const next = { ...prev };
      if (!next[role]) next[role] = {};
      const current = next[role][module] || [];

      if (current.includes(action)) {
        next[role] = {
          ...next[role],
          [module]: current.filter((a) => a !== action),
        };
      } else {
        next[role] = {
          ...next[role],
          [module]: [...current, action],
        };
      }
      return next;
    });
  };

  // Toggle sidebar access (pseudo-module)
  const toggleSidebarAccess = (role: string, module: string) => {
    const current = permissions[role]?.[module] || [];
    const hasAccess = current.includes("access");
    toggleAction(role, module, "access");
    // If removing access, do nothing extra. If adding, just add "access"
    if (hasAccess) {
      // Remove the entire module entry if empty
      setPermissions((prev) => {
        const next = { ...prev };
        if (next[role]?.[module]?.length === 0) {
          const { [module]: _, ...rest } = next[role];
          next[role] = rest;
        }
        return next;
      });
    }
  };

  // Reset to original
  const handleReset = () => {
    setPermissions(JSON.parse(JSON.stringify(original)));
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Build changes array from diff
      const changes: { role: string; module: string; actions: string[] }[] = [];

      for (const role of EDITABLE_ROLES) {
        const allModules = new Set([
          ...Object.keys(permissions[role] || {}),
          ...Object.keys(original[role] || {}),
        ]);

        for (const mod of allModules) {
          const newActions = permissions[role]?.[mod] || [];
          const oldActions = original[role]?.[mod] || [];
          if (JSON.stringify(newActions.sort()) !== JSON.stringify(oldActions.sort())) {
            changes.push({ role, module: mod, actions: newActions });
          }
        }
      }

      if (changes.length === 0) return;

      const res = await fetch("/api/configuracion/permisos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      setOriginal(JSON.parse(JSON.stringify(permissions)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="Permisos por Rol" icon={<Lock size={22} />} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-gray-500" size={32} />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Permisos por Rol" icon={<Lock size={22} />} />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1600px] space-y-6">

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between">
            <p className="text-gray-500 text-sm">
              Edita los permisos de cada rol. Los cambios en <span className="text-amber-400">super_admin</span> no son editables.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                disabled={!hasChanges || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-wuipi-border
                         text-gray-400 text-sm hover:bg-wuipi-card-hover disabled:opacity-30 transition-colors"
              >
                <RotateCcw size={14} /> Descartar
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  saved
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-[#F46800] text-white hover:bg-[#F46800]/90 disabled:opacity-30"
                )}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
              </button>
            </div>
          </div>

          {/* Sidebar Access Section */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-wuipi-border bg-wuipi-card">
              <h3 className="text-white font-semibold text-sm">Acceso al Sidebar</h3>
              <p className="text-gray-500 text-xs mt-0.5">Controla qué secciones aparecen en el menú lateral de cada rol</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wuipi-border">
                    <th className="text-left text-gray-500 font-medium px-4 py-2.5 sticky left-0 bg-wuipi-bg z-10 min-w-[160px]">
                      Módulo
                    </th>
                    {EDITABLE_ROLES.map((role) => (
                      <th key={role} className="text-center px-2 py-2.5 min-w-[90px]">
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", ROLE_CONFIG[role]?.color)}>
                          {ROLE_CONFIG[role]?.label || role}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIDEBAR_ONLY_MODULES.map((mod) => (
                    <tr key={mod} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover/30">
                      <td className="px-4 py-2 text-gray-300 sticky left-0 bg-wuipi-bg z-10">
                        {MODULE_LABELS[mod] || mod}
                      </td>
                      {EDITABLE_ROLES.map((role) => {
                        const hasAccess = (permissions[role]?.[mod] || []).includes("access");
                        return (
                          <td key={role} className="text-center px-2 py-2">
                            <button
                              onClick={() => toggleSidebarAccess(role, mod)}
                              className={cn(
                                "w-7 h-7 rounded-md border transition-all mx-auto flex items-center justify-center",
                                hasAccess
                                  ? "bg-[#F46800]/20 border-[#F46800]/40 text-[#F46800]"
                                  : "border-wuipi-border/50 text-transparent hover:border-gray-500"
                              )}
                            >
                              <Check size={14} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Operational modules — sidebar access derived from having any action */}
                  {OPERATIONAL_MODULES.map((mod) => {
                    const sidebarId = MODULE_SIDEBAR_MAP[mod];
                    if (!sidebarId) return null;
                    return (
                      <tr key={mod} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover/30">
                        <td className="px-4 py-2 text-gray-300 sticky left-0 bg-wuipi-bg z-10">
                          {MODULE_LABELS[mod] || mod}
                        </td>
                        {EDITABLE_ROLES.map((role) => {
                          const actions = permissions[role]?.[mod] || [];
                          const hasAny = actions.length > 0;
                          return (
                            <td key={role} className="text-center px-2 py-2">
                              <div
                                className={cn(
                                  "w-7 h-7 rounded-md border mx-auto flex items-center justify-center",
                                  hasAny
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                                    : "border-wuipi-border/30 text-gray-700"
                                )}
                                title={hasAny ? `${actions.length} acción(es)` : "Sin acceso"}
                              >
                                <Check size={14} />
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Granular Permissions Section */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-wuipi-border bg-wuipi-card">
              <h3 className="text-white font-semibold text-sm">Permisos Granulares</h3>
              <p className="text-gray-500 text-xs mt-0.5">Controla las acciones específicas que cada rol puede realizar en cada módulo</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wuipi-border">
                    <th className="text-left text-gray-500 font-medium px-4 py-2.5 sticky left-0 bg-wuipi-bg z-10 min-w-[160px]">
                      Módulo / Acción
                    </th>
                    {EDITABLE_ROLES.map((role) => (
                      <th key={role} className="text-center px-2 py-2.5 min-w-[90px]">
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", ROLE_CONFIG[role]?.color)}>
                          {ROLE_CONFIG[role]?.label || role}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {OPERATIONAL_MODULES.map((mod) => (
                    <ModuleActionRows
                      key={mod}
                      module={mod}
                      permissions={permissions}
                      onToggle={toggleAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ============================================================
// Sub-component: Module action rows
// ============================================================

function ModuleActionRows({
  module,
  permissions,
  onToggle,
}: {
  module: Module;
  permissions: PermissionsMap;
  onToggle: (role: string, module: string, action: string) => void;
}) {
  return (
    <>
      {/* Module header row */}
      <tr className="bg-wuipi-card/50">
        <td
          colSpan={EDITABLE_ROLES.length + 1}
          className="px-4 py-2 text-white font-semibold text-xs uppercase tracking-wider sticky left-0 bg-wuipi-card/50 z-10"
        >
          {MODULE_LABELS[module] || module}
        </td>
      </tr>
      {/* Action rows */}
      {OPERATIONAL_ACTIONS.map((action) => (
        <tr key={`${module}-${action}`} className="border-b border-wuipi-border/30 hover:bg-wuipi-card-hover/20">
          <td className="px-4 py-1.5 pl-8 text-gray-400 text-xs sticky left-0 bg-wuipi-bg z-10">
            {ACTION_LABELS[action] || action}
          </td>
          {EDITABLE_ROLES.map((role) => {
            const hasAction = (permissions[role]?.[module] || []).includes(action);
            return (
              <td key={role} className="text-center px-2 py-1.5">
                <button
                  onClick={() => onToggle(role, module, action)}
                  className={cn(
                    "w-6 h-6 rounded border transition-all mx-auto flex items-center justify-center",
                    hasAction
                      ? "bg-[#F46800]/20 border-[#F46800]/40 text-[#F46800]"
                      : "border-wuipi-border/40 text-transparent hover:border-gray-500"
                  )}
                >
                  <Check size={12} />
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
