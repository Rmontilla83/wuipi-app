import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
    // Endpoints del portal cliente: cada uno hace su propia auth (dual —
    // portalCaller via cookie HMAC O Supabase Magic Link). Salen del scope
    // del middleware porque el middleware corre en Edge runtime y no puede
    // leer la cookie HMAC propia (Node crypto no está disponible en edge).
    // Los endpoints admin dentro de /api/portal/* (ej. /api/portal/invite)
    // hacen requirePermission internamente — siguen siendo seguros.
    "/api/portal/",
    // Mismo razonamiento: /api/odoo/clients/[id] tiene dual auth interno
    // que valida ownership (portal client solo ve su propio data).
    "/api/odoo/clients/",
    // Endpoint público para logs de errores client-side desde global-error
    // y /pagar/error boundaries. Sin auth — solo escribe a portal_invite_logs.
    "/api/log-client-error",
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

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Block portal clients from accessing the dashboard
  // Clients authenticated via Magic Link have role "cliente" in app_metadata
  const role = session?.user?.app_metadata?.role;
  const isDashboardRoute = !pathname.startsWith("/portal") && !pathname.startsWith("/api/portal") && !pathname.startsWith("/login");
  if (role === "cliente" && isDashboardRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/inicio";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|img/|api/health|api/auth/callback|auth/confirm|api/cron|api/bequant/cron).*)",
  ],
};
