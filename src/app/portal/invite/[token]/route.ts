// GET /portal/invite/[token]
//
// Public endpoint that consumes a permanent portal-invite token (HMAC of
// partnerId) and redirects the customer to a freshly-generated Supabase
// Magic Link. This is the "front door" of the portal for customers who:
//   - Got invited from the admin's "Invitar al portal" button (WA + email)
//   - Clicked "Ir a mi portal" after paying via /pagar/[token]
//   - Followed a long-lived link from an email campaign
//
// The invite token itself is permanent (HMAC, no expiry). The Supabase OTP
// it generates expires in 24h, but the customer doesn't care — they just
// re-click the same WA button and get another fresh OTP. This is how we
// work around Supabase's 24h cap on OTP expiration for our 30-day campaigns.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyPortalInviteToken } from "@/lib/utils/portal-invite-token";
import { createAdminSupabase } from "@/lib/supabase/server";
import { searchRead, isOdooConfigured } from "@/lib/integrations/odoo";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

function errorRedirect(origin: string, code: string) {
  const url = new URL("/portal/acceso", origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

// User-Agents que pre-cargan URLs para generar link previews. Cuando WhatsApp
// recibe un mensaje con un boton URL, su backend (y a veces el cliente)
// pre-fetcha la URL para generar preview/anti-phishing. Si dejamos que ese
// pre-fetch corra el flujo completo, consume el Magic Link de Supabase
// (single-use) y cuando el usuario REAL hace clic, el token ya esta usado
// → "El enlace de acceso expiro o ya fue usado".
//
// Para esos User-Agents devolvemos una pagina HTML minima sin generar el
// Magic Link. La URL final que ve el bot es la misma que la del usuario, asi
// que el preview se ve igual, pero el token no se quema.
const BOT_USER_AGENTS = [
  "whatsapp",
  "facebookexternalhit",
  "facebookcatalog",
  "instagram",
  "telegrambot",
  "twitterbot",
  "slackbot",
  "discordbot",
  "linkedinbot",
  "googlebot",
  "bingbot",
  "yandexbot",
  "skypeuripreview",
];

function isBotPrefetch(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

function botPreviewPage(): NextResponse {
  // HTML minimo que sirve para preview: titulo + descripcion + nada de
  // JavaScript ni autoredirect. El bot extrae meta tags para mostrarlas en el
  // mensaje; el usuario humano nunca ve este HTML porque siempre llega con
  // un User-Agent de browser real y entra al flujo del Magic Link.
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Portal Wuipi</title>
<meta name="description" content="Tu portal de cliente Wuipi — facturas, servicios y pago en un solo lugar.">
<meta property="og:title" content="Portal Wuipi">
<meta property="og:description" content="Accede a tu cuenta Wuipi sin contraseña. Toca el botón para entrar.">
<meta property="og:type" content="website">
</head>
<body>
<h1>Portal Wuipi</h1>
<p>Tu portal personal de cliente. Toca el botón en tu WhatsApp o correo para entrar.</p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Importante: no-store evita que la pagina del bot llegue al cache CDN
      // y se sirva al usuario real cuando hace clic.
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const origin = request.nextUrl.origin;

  // Bot pre-fetch guard: si el User-Agent es un crawler de link preview,
  // devolvemos una pagina simple sin generar el Magic Link. Esto evita que
  // el OTP single-use se queme antes de que el usuario haga clic.
  if (isBotPrefetch(request.headers.get("user-agent"))) {
    return botPreviewPage();
  }

  // Rate limit: 20 redemptions/min per IP. Generous so the legitimate user
  // who hammers the button a few times isn't blocked, but stops scrapers
  // from enumerating tokens.
  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`portal-invite:${ip}`, 20, 60_000);
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

  // Lookup partner email in Odoo. We don't trust any input — the partnerId
  // came from a signed token, but the email of record lives in Odoo.
  let partner: { id: number; name: string; email: string } | null = null;
  try {
    const partners = await searchRead("res.partner", [
      ["id", "=", partnerId],
    ], { fields: ["id", "name", "email"], limit: 1 });
    if (partners.length > 0) {
      partner = partners[0] as { id: number; name: string; email: string };
    }
  } catch (err) {
    console.error("[Portal Invite] Odoo lookup failed:", err);
    return errorRedirect(origin, "odoo_error");
  }

  if (!partner) {
    return errorRedirect(origin, "partner_not_found");
  }

  const email = (partner.email || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorRedirect(origin, "no_email");
  }

  // Generate Magic Link. If the user doesn't exist yet in Supabase Auth,
  // create them first with the right app_metadata so /auth/confirm doesn't
  // have to do another Odoo lookup.
  const admin = createAdminSupabase();

  let linkResult = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  // Supabase returns an error with "User not found" (or similar) when the
  // email isn't registered yet. Create the user and retry once. We pre-fill
  // app_metadata so the customer lands in the portal directly without an
  // Odoo lookup round-trip in /auth/confirm.
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
        console.error("[Portal Invite] createUser failed:", createResult.error.message);
        return errorRedirect(origin, "create_user_failed");
      }
      linkResult = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
    }

    if (linkResult.error) {
      console.error("[Portal Invite] generateLink failed:", linkResult.error.message);
      return errorRedirect(origin, "magiclink_failed");
    }
  }

  // properties.hashed_token is what /auth/confirm will exchange for a session
  // via supabase.auth.verifyOtp({ type: 'magiclink', token_hash }).
  const hashedToken = linkResult.data?.properties?.hashed_token;
  if (!hashedToken) {
    console.error("[Portal Invite] generateLink returned no hashed_token");
    return errorRedirect(origin, "no_token");
  }

  // Send the customer through /auth/confirm so the session cookie gets set
  // on OUR domain (not Supabase's project URL). That route knows to redirect
  // to /portal/inicio when next is a portal route.
  const confirmUrl = new URL("/auth/confirm", APP_URL);
  confirmUrl.searchParams.set("token_hash", hashedToken);
  confirmUrl.searchParams.set("type", "magiclink");
  confirmUrl.searchParams.set("next", "/portal/inicio");

  return NextResponse.redirect(confirmUrl);
}
