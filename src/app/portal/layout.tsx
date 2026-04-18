import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { PortalProvider } from "@/lib/portal/context";
import { PortalHeader } from "@/components/portal/header";
import { PortalNav } from "@/components/portal/nav";
import { QueryProvider } from "@/components/layout/query-provider";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Check if this is the login page — skip auth check
  // Layout wraps ALL routes including /portal/login, so we need to let login through

  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const partnerId = user?.app_metadata?.odoo_partner_id;
  const customerName = user?.app_metadata?.customer_name || "";

  // If not authenticated or no partner_id (e.g. admin previewing, or login page),
  // skip the client-portal shell but KEEP QueryProvider so children that use
  // useQuery (e.g. /portal/preview/[partnerId] → MyConnectionView) still work.
  if (!user || !partnerId) {
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
