import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function syncRoleAndCheckSetup(userId: string, appMetadata: Record<string, unknown>, origin: string, next: string) {
  try {
    const admin = createAdminSupabase();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role && profile.role !== "cliente") {
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...appMetadata,
          role: profile.role,
        },
      });
    }
  } catch (e) {
    console.error("[Auth Callback] Failed to sync app_metadata.role:", e);
  }

  // Invited users need to set their password first
  if (appMetadata?.needs_password_setup) {
    return NextResponse.redirect(`${origin}/setup-password`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/comando";

  // Validate redirect target — must be a relative path, no protocol or external domain
  const next = /^\/[a-zA-Z0-9\-_/]*$/.test(rawNext) ? rawNext : "/comando";

  const supabase = createServerSupabase();

  // Flow 1: PKCE — code in query params (magic links, email OTP)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.session?.user) {
      const user = data.session.user;
      return syncRoleAndCheckSetup(user.id, user.app_metadata, origin, next);
    }
  }

  // Flow 2: Implicit — session established by Supabase /verify redirect (invites)
  // Supabase sets session cookies during the 303 redirect from /verify,
  // so the session may already exist even without a code parameter.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const user = session.user;
    // Re-read app_metadata from admin to get the latest (including needs_password_setup)
    const admin = createAdminSupabase();
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    const meta = authUser?.user?.app_metadata ?? user.app_metadata;
    return syncRoleAndCheckSetup(user.id, meta, origin, next);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
