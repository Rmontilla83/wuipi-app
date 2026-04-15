import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const origin = request.nextUrl.origin;

  if (tokenHash && type) {
    const supabase = createServerSupabase();

    // verifyOtp exchanges the token_hash for a session (works for invite, email, magiclink, recovery)
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error && data?.session?.user) {
      const user = data.session.user;

      // Sync role from profiles to app_metadata
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
        console.error("[Auth Confirm] Failed to sync role:", e);
      }

      // Re-read app_metadata to get the latest (including needs_password_setup)
      const admin = createAdminSupabase();
      const { data: freshUser } = await admin.auth.admin.getUserById(user.id);
      const meta = freshUser?.user?.app_metadata ?? user.app_metadata;

      // Invited users need to set their password
      if (meta?.needs_password_setup) {
        return NextResponse.redirect(`${origin}/setup-password`);
      }

      return NextResponse.redirect(`${origin}/comando`);
    }
  }

  // Token invalid or expired
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
