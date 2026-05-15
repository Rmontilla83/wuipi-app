import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/auth/portal-session";

export async function middleware(request: NextRequest) {
  // Public routes — skip auth entirely (no Supabase call, no cookie manipulation)
  const publicPaths = [
    "/login",
    "/setup-password",
    "/api/version",
    "/pagar/",
    // /api/mercantil (root) recibe los webhooks de Mercantil — registrado
    // sin sufijo. Match exacto abajo. Las subrutas viejas (/webhook, /callback,
    // /create-payment, /reconcile, /status) fueron eliminadas en 2026-05-03.
    "/api/cobranzas/webhook/",
    "/api/cobranzas/bcv",
    "/api/cobranzas/pay",       // includes /pay, /pay/confirm, /pay/c2p-confirm
    "/api/cobranzas/wpy_",      // public payment tokens
    "/api/pagar/",              // Public client payment endpoints
    "/pagar/cliente/",          // Public client payment page
    "/portal/",                 // Customer portal (own auth at layout level)
    "/i/",                      // Short-path invite alias (sets wpi_session cookie)
    "/api/portal/verify-email", // Pre-login email check (must be public)
    "/api/kommo/ventas/webhook", // Kommo sales bot webhook (external)
  ];
  const { pathname } = request.nextUrl;
  const isPublic =
    publicPaths.some((path) => pathname.startsWith(path)) ||
    pathname === "/api/mercantil"; // exact match — no abrir subrutas admin

  // Inject pathname into a header so server components/layouts can read it
  // without needing client-side hooks. Used by /portal/layout.tsx to decide
  // whether an unauthenticated visit should redirect to /portal/acceso.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (isPublic) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Use getSession() instead of getUser() — reads JWT locally, no HTTP call.
  // getUser() makes a network request to Supabase on every request which
  // causes MIDDLEWARE_INVOCATION_TIMEOUT on Vercel Hobby (1.5s limit).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // Sesión portal propia (cookie HMAC seteada por /i/[token] o /portal/invite/).
  // Coexiste con Supabase Auth — solo se usa cuando el cliente entró por el
  // flujo de invitación corto, no por Magic Link.
  const portalSession = !user ? getPortalSessionFromRequest(request) : null;

  // Sin ninguna sesión → /login. Los clientes portal sin sesión llegan acá
  // si la cookie expiró o nunca pasaron por /i/.
  if (!user && !portalSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Restringir al portal cliente a rutas válidas. Tanto los autenticados por
  // Magic Link Supabase (role=cliente) como los autenticados por cookie HMAC
  // (portalSession) solo pueden tocar:
  //   - /portal/*           el portal en sí
  //   - /api/portal/*       endpoints del portal
  //   - /api/odoo/clients/* su propia data en Odoo (el endpoint valida ownership)
  //   - /api/cobranzas/bcv  tasa BCV pública
  //   - /login              para cambiar de cuenta
  // Cualquier otra ruta (dashboard) → redirect al portal.
  const roleSupabase = session?.user?.app_metadata?.role;
  const isPortalClient = !!portalSession || roleSupabase === "cliente";

  if (isPortalClient) {
    const allowedForPortal =
      pathname.startsWith("/portal") ||
      pathname.startsWith("/api/portal") ||
      pathname.startsWith("/api/odoo/clients") ||
      pathname === "/api/cobranzas/bcv" ||
      pathname.startsWith("/login");
    if (!allowedForPortal) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/inicio";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|img/|api/health|api/auth/callback|auth/confirm|api/cron|api/bequant/cron).*)",
  ],
};
