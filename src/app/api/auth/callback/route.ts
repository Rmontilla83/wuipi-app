import { createServerSupabase } from "@/lib/supabase/server";
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
    if (!error) {
      // Check if user needs to set password (invited users have no password yet)
      const user = data?.session?.user;
      const isInvited = user && !user.last_sign_in_at;
      if (isInvited) {
        return NextResponse.redirect(`${origin}/setup-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
