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

    // Look up partner in Odoo by email
    const email = data.user.email;
    if (email) {
      const partners = await searchRead("res.partner", [
        ["email", "=", email],
        ["customer_rank", ">", 0],
      ], { fields: ["id", "name"], limit: 1 });

      if (partners.length > 0) {
        // Store partner_id in app_metadata (not user_metadata — user_metadata is editable by end users)
        // IMPORTANT: merge with existing app_metadata to preserve the user's dashboard role
        // (e.g., an admin who is also an Odoo client should keep role "admin")
        const admin = createAdminSupabase();
        const existingMeta = data.user.app_metadata || {};
        await admin.auth.admin.updateUserById(data.user.id, {
          app_metadata: {
            ...existingMeta,
            odoo_partner_id: partners[0].id,
            customer_name: partners[0].name,
            // Only set role to "cliente" if user doesn't already have a dashboard role
            role: existingMeta.role || "cliente",
          },
        });
      }
    }

    return NextResponse.redirect(`${origin}/portal/inicio`);
  } catch (err) {
    console.error("[Portal Callback] Error:", err);
    return NextResponse.redirect(`${origin}/portal/login`);
  }
}
