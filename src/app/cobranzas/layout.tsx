import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { QueryProvider } from "@/components/layout/query-provider";
import { getCallerProfile } from "@/lib/auth/check-permission";
import { can } from "@/lib/auth/permissions";

// Layout del panel interno de Cobranzas.
//
// Rutas públicas: /cobranzas/acceso (login). El resto exige sesión Supabase
// activa CON permiso `cobranzas:read`.
//
// Por qué no se reutiliza el sidebar/topbar viejo: ya no existen (Fase 5 de
// la migración a Odoo nuevo los eliminó). Este panel construye su propia
// chrome mínima (solo header) para no reintroducir un layout completo de
// dashboard solo para una vista.

export default async function CobranzasLayout({ children }: { children: React.ReactNode }) {
  const pathname = headers().get("x-pathname") || "";
  const isPublic = pathname.startsWith("/cobranzas/acceso");

  if (isPublic) {
    return <QueryProvider>{children}</QueryProvider>;
  }

  const caller = await getCallerProfile();
  if (!caller) {
    redirect("/cobranzas/acceso");
  }
  if (!can(caller.role, "cobranzas", "read")) {
    redirect("/cobranzas/acceso?error=forbidden");
  }

  return <QueryProvider>{children}</QueryProvider>;
}
