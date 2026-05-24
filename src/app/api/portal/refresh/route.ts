// GET /api/portal/refresh?next=<path>
//
// Auto-login silencioso vía refresh token. El layout del portal redirige
// aquí cuando detecta que el cliente tiene `wpi_refresh` válido pero
// perdió `wpi_session` (Safari ITP, browser limpieza, etc.).
//
// Este endpoint REGENERA wpi_session desde el refresh y redirige al
// `next` original. Para el cliente es invisible — solo ve un redirect
// efímero. Si tampoco hay refresh válido, va a /portal/acceso (login normal).
//
// Está en un Route Handler (NO server component) porque `cookies().set()`
// solo funciona acá según las reglas de Next.js 14+.

import { NextRequest, NextResponse } from "next/server";
import {
  getPortalRefreshFromCookieJar,
  setPortalSession,
} from "@/lib/auth/portal-session";

export const dynamic = "force-dynamic";

// Solo permitimos redirect a paths internos del portal (defensa contra open-redirect).
const SAFE_NEXT_RE = /^\/portal\/[a-zA-Z0-9\-_/.?=&%]*$/;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawNext = url.searchParams.get("next") || "/portal/inicio";
  const safeNext = SAFE_NEXT_RE.test(rawNext) ? rawNext : "/portal/inicio";

  const refresh = getPortalRefreshFromCookieJar();
  if (!refresh) {
    // Sin refresh válido: mandar al login normal.
    return NextResponse.redirect(new URL("/portal/acceso", request.url));
  }

  const response = NextResponse.redirect(new URL(safeNext, request.url));
  setPortalSession(response.cookies, {
    pid: refresh.pid,
    name: refresh.name,
    email: refresh.email,
  });
  return response;
}
