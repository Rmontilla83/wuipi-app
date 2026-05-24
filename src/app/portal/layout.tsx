import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PortalProvider } from "@/lib/portal/context";
import { PortalHeader } from "@/components/portal/header";
import { PortalNav } from "@/components/portal/nav";
import { QueryProvider } from "@/components/layout/query-provider";
import { getPortalSessionFromCookieJar, hasValidPortalRefresh } from "@/lib/auth/portal-session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Auth del portal: cookie HMAC `wpi_session` seteada por /api/portal/login
  // (y signup, reset-password/confirm). El password storage lo maneja
  // Supabase Auth pero la sesión real es nuestra cookie HMAC porque el
  // webview de WhatsApp no propaga cookies de Supabase confiablemente.
  const portalSession = getPortalSessionFromCookieJar();

  const partnerId = portalSession?.pid;
  const customerName = portalSession?.name || "";
  const email = portalSession?.email || "";

  // Rutas del portal que se renderizan SIN sesión:
  //   - /portal/acceso          → login / signup / olvidé contraseña
  //   - /portal/reset-password  → cliente llega del email para resetear
  //   - /portal/preview/*       → admin viendo un cliente (requirePermission)
  // El resto (inicio, facturas, suscripciones, mi-conexion, ayuda) son rutas
  // del área cliente y requieren sesión, sino usePortal() crashea.
  const pathname = headers().get("x-pathname") || "";
  const isPublicPortalRoute =
    pathname.startsWith("/portal/acceso") ||
    pathname.startsWith("/portal/reset-password") ||
    pathname.startsWith("/portal/preview");

  const isAuthenticated = !!partnerId;
  if (!isAuthenticated) {
    if (!isPublicPortalRoute) {
      // Si hay refresh válido pero no session (Safari ITP, browser cleanup),
      // regeneramos session vía Route Handler y volvemos a la página original.
      // El cliente no ve el form de login.
      if (hasValidPortalRefresh()) {
        const next = pathname || "/portal/inicio";
        redirect(`/api/portal/refresh?next=${encodeURIComponent(next)}`);
      }
      redirect("/portal/acceso");
    }
    // Rutas públicas del portal mantienen su propio modelo de auth pero
    // igual necesitan QueryProvider para componentes con useQuery.
    return <QueryProvider>{children}</QueryProvider>;
  }

  return (
    <QueryProvider>
      <PortalProvider partnerId={partnerId} customerName={customerName} email={email}>
        <div className="min-h-screen bg-wuipi-bg flex flex-col">
          <PortalHeader />
          <PortalNav />
          <main className="flex-1 pb-20 sm:pb-4">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {children}
            </div>
          </main>
        </div>
      </PortalProvider>
    </QueryProvider>
  );
}
