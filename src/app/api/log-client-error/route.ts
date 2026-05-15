// POST /api/log-client-error
//
// Endpoint público que recibe errores client-side desde los error boundaries
// y los persiste en portal_invite_logs (reutilizada como tabla genérica de
// debugging). No requiere auth — es para diagnóstico en producción cuando
// no hay DevTools accesible.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getClientIP } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = String(body?.message || "").slice(0, 500);
    const stack = String(body?.stack || "").slice(0, 2000);
    const digest = body?.digest ? String(body.digest).slice(0, 100) : null;
    const path = String(body?.path || "").slice(0, 500);
    const url = String(body?.url || "").slice(0, 1000);
    const scope = String(body?.scope || "page").slice(0, 50);

    const sb = createAdminSupabase();
    await sb.from("portal_invite_logs").insert({
      method: "CLIENT_ERROR",
      path: path || "/",
      action: `client_error:${scope}`,
      status_code: 0,
      user_agent: request.headers.get("user-agent") || null,
      ip: getClientIP(request.headers) || null,
      referer: request.headers.get("referer") || null,
      error_message: message,
      meta: { stack, digest, url, scope },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Nunca falla — solo es log de diagnóstico.
    return NextResponse.json({ ok: false });
  }
}
