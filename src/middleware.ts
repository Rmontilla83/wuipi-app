import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware minimalista — la mayoría de la auth vive en cada route handler
 * o en el layout del portal.
 *
 * Lo único que hace este middleware:
 *   1. Inyecta `x-pathname` para que server components (ej. portal/layout.tsx)
 *      puedan leer la ruta sin client hooks.
 *
 * No se valida Supabase Auth en middleware porque:
 *   - Los endpoints admin (`/api/admin/**`) hacen `requirePermission()` internamente.
 *   - Los endpoints del portal cliente (`/api/portal/**`, `/api/odoo/clients/**`)
 *     validan dual: admin via Supabase OR portal via cookie HMAC `wpi_session`.
 *     La cookie HMAC requiere Node crypto, no disponible en runtime edge.
 *   - Los endpoints públicos (pasarelas, webhooks, /pagar/*) no requieren auth.
 *
 * Como ya no hay UI de dashboard (Fase 5 adelantada), no hay rutas protegidas
 * que requieran redirect-a-login global.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|img/).*)",
  ],
};
