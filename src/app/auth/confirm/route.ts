import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { searchRead } from "@/lib/integrations/odoo";

// WhatsApp/iOS/Android webviews cachean redirects 307 agresivamente. Sin
// estos headers, una primera respuesta de /auth/confirm (sea success o
// failure) se sirve desde cache cuando el usuario re-clickea el boton —
// nunca volvemos a verificar el token.
const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

function withNoCache(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  const origin = request.nextUrl.origin;

  // Only allow same-origin paths as "next" — prevents open redirect.
  const safeNext = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : null;
  const isPortalNext = safeNext?.startsWith("/portal");
  const failureUrl = isPortalNext
    ? `${origin}/portal/acceso?error=auth`
    : `${origin}/login?error=auth`;

  if (!tokenHash || !type) {
    return withNoCache(NextResponse.redirect(failureUrl));
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data?.session?.user) {
    return withNoCache(NextResponse.redirect(failureUrl));
  }

  const user = data.session.user;
  const admin = createAdminSupabase();

  // Sync role + odoo_partner_id from authoritative sources into app_metadata.
  // Order matters: read existing meta and dashboard profile first, then attach
  // odoo_partner_id if the email matches a customer in Odoo. This mirrors what
  // /portal/auth/callback (PKCE flow) does, so token_hash users land in the
  // same shape regardless of which flow they came through.
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const dashboardRole = profile?.role;
    const isSystemUser = dashboardRole && dashboardRole !== "cliente";
    const existingMeta = user.app_metadata || {};
    const patch: Record<string, unknown> = { ...existingMeta };
    let needsUpdate = false;

    if (isSystemUser && existingMeta.role !== dashboardRole) {
      patch.role = dashboardRole;
      needsUpdate = true;
    }

    // Attach odoo_partner_id if missing — needed for portal access.
    if (!existingMeta.odoo_partner_id && user.email) {
      try {
        const partners = await searchRead("res.partner", [
          ["email", "=", user.email],
          ["customer_rank", ">", 0],
        ], { fields: ["id", "name"], limit: 1 });
        if (partners.length > 0) {
          patch.odoo_partner_id = partners[0].id;
          patch.customer_name = partners[0].name;
          if (!existingMeta.role) patch.role = "cliente";
          needsUpdate = true;
        }
      } catch (e) {
        console.warn("[Auth Confirm] Odoo lookup failed:", e);
      }
    }

    if (needsUpdate) {
      await admin.auth.admin.updateUserById(user.id, { app_metadata: patch });
    }
  } catch (e) {
    console.error("[Auth Confirm] Failed to sync metadata:", e);
  }

  // Re-read app_metadata to honor needs_password_setup if it was set.
  const { data: freshUser } = await admin.auth.admin.getUserById(user.id);
  const meta = freshUser?.user?.app_metadata ?? user.app_metadata;

  if (meta?.needs_password_setup) {
    return withNoCache(NextResponse.redirect(`${origin}/setup-password`));
  }

  // Route: explicit `next` wins (validated above), otherwise pick by role.
  // Portal clients → /portal/inicio. Dashboard users → /comando.
  if (safeNext) {
    return withNoCache(NextResponse.redirect(`${origin}${safeNext}`));
  }
  if (meta?.odoo_partner_id && meta?.role === "cliente") {
    return withNoCache(NextResponse.redirect(`${origin}/portal/inicio`));
  }
  return withNoCache(NextResponse.redirect(`${origin}/comando`));
}
