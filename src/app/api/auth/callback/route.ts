import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/comando";

  // Validate redirect target — must be a relative path, no protocol or external domain
  const next = /^\/[a-zA-Z0-9\-_/]*$/.test(rawNext) ? rawNext : "/comando";

  if (code) {
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.session?.user) {
      const user = data.session.user;

      // Sync app_metadata.role from profiles table so middleware routes correctly
      try {
        const admin = createAdminSupabase();
        const { data: profile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role && profile.role !== "cliente") {
          await admin.auth.admin.updateUserById(user.id, {
            app_metadata: {
              ...user.app_metadata,
              role: profile.role,
            },
          });
        }
      } catch (e) {
        console.error("[Auth Callback] Failed to sync app_metadata.role:", e);
      }

      // Check if user needs to set password (invited users have no password yet)
      const isInvited = !user.last_sign_in_at;
      if (isInvited) {
        return NextResponse.redirect(`${origin}/setup-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
