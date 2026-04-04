import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { getSidebarModules } from "@/lib/dal/permissions";
import { SIDEBAR_MODULE_MAP } from "@/lib/auth/permissions";
import type { UserRole, UserProfile } from "@/types";
import { ROLE_PERMISSIONS } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Default profile if table doesn't exist yet (dev mode)
  const userProfile: UserProfile = profile || {
    id: user.id,
    email: user.email || "",
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuario",
    role: user.user_metadata?.role || "admin",
    is_active: true,
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at,
  };

  // Fetch sidebar modules from DB, fallback to hardcoded
  let sidebarNavIds: string[];
  try {
    const dbModules = await getSidebarModules(userProfile.role as UserRole);
    // Convert permission module names → sidebar nav IDs
    const reverseMap = Object.fromEntries(
      Object.entries(SIDEBAR_MODULE_MAP).map(([k, v]) => [v, k])
    );
    sidebarNavIds = dbModules.map((m) => reverseMap[m] || m);
  } catch {
    sidebarNavIds = ROLE_PERMISSIONS[userProfile.role as UserRole] || [];
  }

  return (
    <div className="flex h-screen overflow-hidden bg-wuipi-bg">
      <Sidebar user={userProfile} allowedModules={sidebarNavIds} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
