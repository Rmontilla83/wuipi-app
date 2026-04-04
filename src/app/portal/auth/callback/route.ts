import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { searchRead } from "@/lib/integrations/odoo";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/portal/login`);
  }

  try {
    // Exchange code for session
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      console.error("[Portal Callback] Session exchange failed:", error?.message);
      return NextResponse.redirect(`${origin}/portal/login`);
    }

    const admin = createAdminSupabase();

    // Check if user has a dashboard role in profiles table (authoritative source)
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const dashboardRole = profile?.role;
    const isSystemUser = dashboardRole && dashboardRole !== "cliente";

    // Look up partner in Odoo by email
    const email = data.user.email;
    if (email) {
      const partners = await searchRead("res.partner", [
        ["email", "=", email],
        ["customer_rank", ">", 0],
      ], { fields: ["id", "name"], limit: 1 });

      if (partners.length > 0) {
        const existingMeta = data.user.app_metadata || {};
        await admin.auth.admin.updateUserById(data.user.id, {
          app_metadata: {
            ...existingMeta,
            odoo_partner_id: partners[0].id,
            customer_name: partners[0].name,
            // Preserve dashboard role from profiles table — never overwrite with "cliente"
            role: isSystemUser ? dashboardRole : (existingMeta.role || "cliente"),
          },
        });
      }
    }

    // System users who happen to be Odoo clients → send to dashboard, not portal
    if (isSystemUser) {
      return NextResponse.redirect(`${origin}/comando`);
    }

    return NextResponse.redirect(`${origin}/portal/inicio`);
  } catch (err) {
    console.error("[Portal Callback] Error:", err);
    return NextResponse.redirect(`${origin}/portal/login`);
  }
}
