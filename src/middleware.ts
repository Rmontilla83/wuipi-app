import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Public routes — skip auth entirely (no Supabase call, no cookie manipulation)
  const publicPaths = [
    "/login",
    "/pay/",
    "/pagar/",
    "/api/mercantil/webhook",
    "/api/mercantil/callback",
    "/api/mercantil/status/",
    "/api/cobranzas/webhook/",
    "/api/cobranzas/bcv",
    "/api/cobranzas/pay",       // includes /pay and /pay/confirm
    "/api/cobranzas/wpy_",      // public payment tokens
    "/api/odoo/",               // Odoo integration (read-only)
    "/api/pagar/",              // Public client payment endpoints
    "/pagar/cliente/",          // Public client payment page
    "/portal/",                 // Customer portal (own auth at layout level)
    "/api/portal/",             // Portal API endpoints
  ];
  const { pathname } = request.nextUrl;
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublic) return NextResponse.next();

  let response = NextResponse.next({
    request: { headers: request.headers },
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
    "/((?!_next/static|_next/image|favicon.ico|img/|api/health|api/auth/callback).*)",
  ],
};
