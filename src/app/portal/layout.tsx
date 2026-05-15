import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { PortalProvider } from "@/lib/portal/context";
import { PortalHeader } from "@/components/portal/header";
import { PortalNav } from "@/components/portal/nav";
import { QueryProvider } from "@/components/layout/query-provider";
import { getPortalSessionFromCookieJar } from "@/lib/auth/portal-session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Dos fuentes de auth para el portal:
  // 1. Cookie wpi_session (HMAC propio, seteada por /portal/invite/[token]).
  //    Es el camino primario para clientes que llegan desde WA/email — no
  //    depende de Supabase ni del webview ejecutando el flujo OTP correcto.
  // 2. Sesión Supabase (Magic Link via /portal/acceso). Camino legacy para
  //    clientes que escriben su email manualmente o admins que entran como
  //    super_admin con app_metadata.odoo_partner_id.
  // Si CUALQUIERA está presente, el cliente está autenticado.
  const portalSession = getPortalSessionFromCookieJar();

  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // partnerId/customerName priorizando la sesión Supabase (puede tener admin
  // role override más rico) y cayendo a la cookie propia.
  const partnerId = user?.app_metadata?.odoo_partner_id ?? portalSession?.pid;
  const customerName = user?.app_metadata?.customer_name || portalSession?.name || "";
  const email = user?.email || portalSession?.email || "";

  // Routes that intentionally render WITHOUT a portal session:
  //   - /portal/acceso         → magic-link login page
  //   - /portal/auth/*         → callback handlers
  //   - /portal/invite/*       → consumes invite token, generates magic link
  //   - /portal/preview/*      → admin viewing a client's portal
  // Anything else (inicio, facturas, suscripciones, mi-conexion, ayuda) is a
  // customer-area route and MUST require a session, otherwise usePortal()
  // crashes the page and the user sees the error boundary.
  const pathname = headers().get("x-pathname") || "";
  const isPublicPortalRoute =
    pathname.startsWith("/portal/acceso") ||
    pathname.startsWith("/portal/auth") ||
    pathname.startsWith("/portal/invite") ||
    pathname.startsWith("/portal/preview");

  // Sin sesión válida (ninguna de las dos) → redirect a /portal/acceso para
  // que pida Magic Link manualmente.
  const isAuthenticated = !!partnerId;
  if (!isAuthenticated) {
    if (!isPublicPortalRoute) {
      redirect("/portal/acceso");
    }
    // Public portal routes (login, preview, invite) keep their own auth model
    // and still need QueryProvider for child components that use useQuery.
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
