import PortalDashboard from "./portal-dashboard";

export const dynamic = "force-dynamic";

// Session enforcement happens in src/app/portal/layout.tsx. By the time this
// page renders, the layout has already verified user + odoo_partner_id and
// mounted PortalProvider, so PortalDashboard can safely call usePortal().
export default function PortalPage() {
  return <PortalDashboard />;
}
