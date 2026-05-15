// /portal/invite/[token]
//
// Public endpoint that consumes a permanent portal-invite token (HMAC of
// partnerId) and authenticates the customer into the portal.
//
// CRITICAL: This route handles GET and POST DIFFERENTLY by design.
//
// GET → renders a minimal HTML interstitial that auto-submits a POST via JS.
//       The Magic Link is NOT generated on GET. This is the fix for the bug
//       where Meta/WhatsApp/email previewers pre-fetch the URL to build link
//       cards, consuming the single-use Supabase Magic Link before the real
//       user clicks. With the interstitial, prefetchers see a static page and
//       cannot trigger auth (they don't execute JS).
//
// POST → generates a fresh Magic Link via Supabase Admin and redirects to
//        /auth/confirm. Only real users with JS reach this handler.
//
// The token itself is permanent (HMAC, no expiry). The Supabase OTP generated
// in the POST expires in 24h, but the customer doesn't care — they just
// re-click the same WA/email button and get another fresh OTP.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyPortalInviteToken } from "@/lib/utils/portal-invite-token";
import { createAdminSupabase } from "@/lib/supabase/server";
import { searchRead, isOdooConfigured } from "@/lib/integrations/odoo";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

// Header set agresivo para CUALQUIER respuesta del flujo de invitacion.
// Sin esto, WhatsApp/iOS/Android webviews cachean redirects 307 y muestran
// resultados viejos sin re-hitear el server — exactamente el bug que vimos
// en produccion: usuario veia "enlace expirado" porque el webview tenia
// cacheado el redirect a /portal/acceso?error=auth de un intento previo.
const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

function errorRedirect(origin: string, code: string) {
  const url = new URL("/portal/acceso", origin);
  url.searchParams.set("error", code);
  const res = NextResponse.redirect(url);
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.headers.set(k, v);
  return res;
}

/**
 * Interstitial HTML. Validates the token superficially in the URL (server-side)
 * but never touches Supabase. JS auto-submits a POST that does the real auth.
 * The <noscript> fallback sends users without JS to /portal/acceso with email
 * pre-filled (they can request a fresh magic link manually).
 */
function interstitialPage(token: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entrando a tu Portal Wuipi…</title>
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="Tu portal de cliente Wuipi — facturas, servicios y pago en un solo lugar.">
<meta property="og:title" content="Portal Wuipi">
<meta property="og:description" content="Accede a tu cuenta Wuipi sin contraseña. Toca el botón para entrar.">
<meta property="og:type" content="website">
<meta http-equiv="cache-control" content="no-cache, no-store, must-revalidate">
<style>
  body { margin: 0; min-height: 100vh; background: #0a0a1a; color: #fff;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         display: flex; align-items: center; justify-content: center; padding: 20px; }
  .card { text-align: center; max-width: 360px; }
  .logo { width: 100px; margin: 0 auto 24px; opacity: 0.95; }
  h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px; }
  p { color: #9ca3af; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
  .spinner { width: 32px; height: 32px; margin: 0 auto;
             border: 3px solid rgba(244,104,0,0.2); border-top-color: #F46800;
             border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .manual { margin-top: 24px; }
  .manual a { display: inline-block; background: #F46800; color: #fff;
              text-decoration: none; padding: 12px 24px; border-radius: 10px;
              font-weight: 600; font-size: 14px; }
</style>
</head>
<body>
<div class="card">
  <img class="logo" src="${APP_URL}/img/wuipi-logo.webp" alt="Wuipi" />
  <h1>Entrando a tu portal…</h1>
  <p>Estamos preparando tu acceso seguro. Esto tomará solo un segundo.</p>
  <div class="spinner" aria-hidden="true"></div>
  <noscript>
    <p style="margin-top:24px;">Tu navegador no permite redirección automática.</p>
    <div class="manual">
      <a href="${APP_URL}/portal/acceso">Continuar manualmente</a>
    </div>
  </noscript>
  <form id="goForm" method="POST" action="${APP_URL}/portal/invite/${token}" style="display:none;">
    <button type="submit">Entrar</button>
  </form>
</div>
<script>
  // Auto-submit el POST que dispara la generacion del Magic Link.
  // Solo navegadores reales con JS llegan aca; los previewers (Meta,
  // WhatsApp link preview, etc.) renderizan el HTML pero no ejecutan JS,
  // asi que no consumen el token de Supabase.
  (function() {
    try { document.getElementById('goForm').submit(); } catch (e) {}
  })();
</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      ...NO_CACHE_HEADERS,
    },
  });
}

/**
 * GET: render the interstitial. Validates the HMAC token only — never
 * generates a Magic Link. If the token is malformed/tampered, fall through
 * to /portal/acceso with an error message instead of rendering the page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const origin = request.nextUrl.origin;
  const partnerId = verifyPortalInviteToken(params.token);
  if (!partnerId) {
    return errorRedirect(origin, "invalid_token");
  }
  return interstitialPage(params.token);
}

/**
 * POST: the actual auth path. Triggered by the JS auto-submit in the
 * interstitial. Validates the token, looks up the partner in Odoo, generates
 * a fresh Supabase Magic Link, and redirects to /auth/confirm. Returns 303
 * (See Other) so the browser follows the redirect with a clean GET to
 * /auth/confirm — proper RFC behavior after POST.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const origin = request.nextUrl.origin;

  // Rate limit per-IP. Generous; only triggers on abuse (token enumeration).
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`portal-invite-go:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return errorRedirect(origin, "rate_limit");
  }

  const partnerId = verifyPortalInviteToken(params.token);
  if (!partnerId) {
    return errorRedirect(origin, "invalid_token");
  }

  if (!isOdooConfigured()) {
    return errorRedirect(origin, "odoo_unavailable");
  }

  // Lookup partner email from Odoo (source of truth — token only carries id).
  let partner: { id: number; name: string; email: string } | null = null;
  try {
    const partners = await searchRead("res.partner", [
      ["id", "=", partnerId],
    ], { fields: ["id", "name", "email"], limit: 1 });
    if (partners.length > 0) {
      partner = partners[0] as { id: number; name: string; email: string };
    }
  } catch (err) {
    console.error("[Portal Invite POST] Odoo lookup failed:", err);
    return errorRedirect(origin, "odoo_error");
  }

  if (!partner) {
    return errorRedirect(origin, "partner_not_found");
  }

  const email = (partner.email || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorRedirect(origin, "no_email");
  }

  const admin = createAdminSupabase();

  let linkResult = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  // Create the user on first use, then retry the magic link generation once.
  if (linkResult.error) {
    const msg = (linkResult.error.message || "").toLowerCase();
    const looksLikeMissingUser = msg.includes("not found")
      || msg.includes("does not exist")
      || msg.includes("invalid login credentials");

    if (looksLikeMissingUser) {
      const createResult = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: {
          odoo_partner_id: partner.id,
          customer_name: partner.name,
          role: "cliente",
        },
      });
      if (createResult.error) {
        console.error("[Portal Invite POST] createUser failed:", createResult.error.message);
        return errorRedirect(origin, "create_user_failed");
      }
      linkResult = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
    }

    if (linkResult.error) {
      console.error("[Portal Invite POST] generateLink failed:", linkResult.error.message);
      return errorRedirect(origin, "magiclink_failed");
    }
  }

  const hashedToken = linkResult.data?.properties?.hashed_token;
  if (!hashedToken) {
    console.error("[Portal Invite POST] generateLink returned no hashed_token");
    return errorRedirect(origin, "no_token");
  }

  const confirmUrl = new URL("/auth/confirm", APP_URL);
  confirmUrl.searchParams.set("token_hash", hashedToken);
  confirmUrl.searchParams.set("type", "magiclink");
  confirmUrl.searchParams.set("next", "/portal/inicio");

  // 303 See Other: tells the browser to follow the redirect with GET, which
  // is what /auth/confirm expects. Prevents the browser from re-POSTing.
  const res = NextResponse.redirect(confirmUrl, 303);
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.headers.set(k, v);
  return res;
}
