import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { PortalProvider } from "@/lib/portal/context";
import { PortalHeader } from "@/components/portal/header";
import { PortalNav } from "@/components/portal/nav";
import { QueryProvider } from "@/components/layout/query-provider";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const partnerId = user?.app_metadata?.odoo_partner_id;
  const customerName = user?.app_metadata?.customer_name || "";

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

  if (!user || !partnerId) {
    if (!isPublicPortalRoute) {
      redirect("/portal/acceso");
    }
    // Public portal routes (login, preview, invite) keep their own auth model
    // and still need QueryProvider for child components that use useQuery.
    return <QueryProvider>{children}</QueryProvider>;
  }

  return (
    <QueryProvider>
      <PortalProvider partnerId={partnerId} customerName={customerName} email={user.email || ""}>
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
