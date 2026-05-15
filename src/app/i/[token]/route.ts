// /i/[token] — alias corto del flujo de invitación al portal.
//
// Existe SOLO porque el path /portal/invite/* quedó envenenado en el cache
// de WhatsApp (w.meta.me proxy + webview cache). Por más cache-buster en la
// URL final, WhatsApp siguió sirviendo el resultado del primer scan fallido
// del bug original (redirect a /portal/acceso?error=auth) sin volver a hitear
// el server. Logs vacíos en portal_invite_logs lo confirmaron.
//
// Este path es nuevo desde la perspectiva del cache de Meta. Una vez que el
// admin actualiza el template Meta a usar `https://api.wuipi.net/i/{{1}}`,
// los clicks llegan al server por primera vez con flujo limpio.
//
// La lógica es 100% espejo de /portal/invite/[token]/route.ts. Si se decide
// matar el path viejo en el futuro, se borra ese archivo y este queda.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyPortalInviteToken } from "@/lib/utils/portal-invite-token";
import { searchRead, isOdooConfigured } from "@/lib/integrations/odoo";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { setPortalSessionOnResponse } from "@/lib/auth/portal-session";
import { createAdminSupabase } from "@/lib/supabase/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

async function logHit(input: {
  method: string;
  request: NextRequest;
  token: string;
  action: string;
  statusCode: number;
  partnerId?: number | null;
  error?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = createAdminSupabase();
    await sb.from("portal_invite_logs").insert({
      method: input.method,
      path: input.request.nextUrl.pathname,
      token_prefix: input.token.slice(0, 8),
      partner_id: input.partnerId ?? null,
      action: input.action,
      status_code: input.statusCode,
      user_agent: input.request.headers.get("user-agent") || null,
      ip: getClientIP(input.request.headers) || null,
      referer: input.request.headers.get("referer") || null,
      error_message: input.error || null,
      meta: input.meta || null,
    });
  } catch {
    // No bloquear el flujo de auth si el logging falla.
  }
}

function errorRedirect(origin: string, code: string) {
  const url = new URL("/portal/acceso", origin);
  url.searchParams.set("error", code);
  const res = NextResponse.redirect(url);
  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.headers.set(k, v);
  return res;
}

/**
 * Defensive token sanitization. Cuando un template Meta tiene su URL del
 * botón configurada como ESTÁTICA en vez de DINÁMICA, Meta no sustituye
 * el `{{1}}` y nuestro server recibe el path `/i/{{1}}<token>` con el
 * literal pegado al frente. Los logs confirmaron este patrón en 2026-05-15.
 *
 * Como defensa, si el token empieza con `{{` (con o sin URL-encoding),
 * strippeamos esa parte y procesamos el resto. Esto deja que el flujo
 * funcione incluso si el template Meta vuelve a romperse, y se loguea
 * el evento para que el admin sepa que tiene que arreglar Meta.
 */
function sanitizeToken(raw: string): { token: string; recovered: boolean } {
  // Patrón observado: {{1}}, %7B%7B1%7D%7D (URL-encoded), %7b%7b1%7d%7d
  const decoded = (() => {
    try { return decodeURIComponent(raw); } catch { return raw; }
  })();
  const match = decoded.match(/^\{\{[^}]+\}\}(.+)$/);
  if (match && match[1]) {
    return { token: match[1], recovered: true };
  }
  return { token: raw, recovered: false };
}

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
  <form id="goForm" method="POST" action="${APP_URL}/i/${token}" style="display:none;">
    <button type="submit">Entrar</button>
  </form>
</div>
<script>
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

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const origin = request.nextUrl.origin;

  // Defensa contra template Meta mal configurado (URL estática con {{1}}
  // literal). Si el token llegó con `{{N}}` al inicio, lo strippeamos.
  const { token: cleanToken, recovered } = sanitizeToken(params.token);

  const partnerId = verifyPortalInviteToken(cleanToken);
  if (!partnerId) {
    await logHit({
      method: "GET", request, token: params.token,
      action: "interstitial_invalid_token", statusCode: 307,
      meta: recovered ? { recovered_from_literal: true } : undefined,
    });
    return errorRedirect(origin, "invalid_token");
  }
  await logHit({
    method: "GET", request, token: params.token,
    action: "interstitial_served", statusCode: 200, partnerId,
    meta: recovered ? { recovered_from_literal: true, clean_token_prefix: cleanToken.slice(0, 8) } : undefined,
  });
  return interstitialPage(cleanToken);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const origin = request.nextUrl.origin;

  const ip = getClientIP(request.headers);
  const rl = checkRateLimit(`portal-i-go:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    await logHit({ method: "POST", request, token: params.token, action: "rate_limited", statusCode: 307 });
    return errorRedirect(origin, "rate_limit");
  }

  // Misma defensa que en GET — el form-POST hereda el path del GET, así que
  // si el GET sobrevivió con sanitización, el POST tiene que aplicarla igual.
  const { token: cleanToken } = sanitizeToken(params.token);

  const partnerId = verifyPortalInviteToken(cleanToken);
  if (!partnerId) {
    await logHit({ method: "POST", request, token: params.token, action: "invalid_token", statusCode: 307 });
    return errorRedirect(origin, "invalid_token");
  }

  if (!isOdooConfigured()) {
    await logHit({ method: "POST", request, token: params.token, action: "odoo_unavailable", statusCode: 307, partnerId });
    return errorRedirect(origin, "odoo_unavailable");
  }

  let partner: { id: number; name: string; email: string } | null = null;
  try {
    const partners = await searchRead("res.partner", [
      ["id", "=", partnerId],
    ], { fields: ["id", "name", "email"], limit: 1 });
    if (partners.length > 0) {
      partner = partners[0] as { id: number; name: string; email: string };
    }
  } catch (err) {
    await logHit({
      method: "POST", request, token: params.token,
      action: "odoo_error", statusCode: 307, partnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorRedirect(origin, "odoo_error");
  }

  if (!partner) {
    await logHit({ method: "POST", request, token: params.token, action: "partner_not_found", statusCode: 307, partnerId });
    return errorRedirect(origin, "partner_not_found");
  }

  const email = (partner.email || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await logHit({ method: "POST", request, token: params.token, action: "no_email", statusCode: 307, partnerId });
    return errorRedirect(origin, "no_email");
  }

  const portalUrl = new URL("/portal/inicio", APP_URL);
  const res = NextResponse.redirect(portalUrl, 303);

  setPortalSessionOnResponse(res, {
    pid: partner.id,
    name: partner.name,
    email,
  });

  for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.headers.set(k, v);

  await logHit({
    method: "POST", request, token: params.token,
    action: "session_set_and_redirect", statusCode: 303, partnerId,
    meta: { redirect_to: portalUrl.toString(), source_path: "/i" },
  });

  return res;
}
