// POST /api/portal/logout
//
// Clears BOTH portal session sources:
//   - The HMAC wpi_session cookie (set by /portal/invite/[token])
//   - The Supabase Auth session (set by the Magic Link flow at /auth/confirm)
//
// Always returns 200 with cleared cookies, even if neither was present.
// Idempotent — safe to call repeatedly.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { clearPortalSessionOnResponse } from "@/lib/auth/portal-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // 1. Clear HMAC cookie.
  clearPortalSessionOnResponse(response);

  // 2. Sign out Supabase session if present. signOut() returns silently when
  //    there's no session, so this is safe to call unconditionally.
  try {
    const sb = createServerSupabase();
    await sb.auth.signOut();
  } catch {
    // Don't block the logout response if Supabase has a hiccup.
  }

  // Defensive no-cache so a logged-out response isn't cached anywhere.
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
