import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isConfigured, findPartnerByEmail } from "@/lib/integrations/odoo-new";
import { findPortalUserByEmail } from "@/lib/auth/portal-auth";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

// Fixed response latency to blunt timing-based enumeration attacks —
// both "exists" and "not exists" complete in roughly the same time.
const MIN_RESPONSE_MS = 400;

async function minTime<T>(p: Promise<T>, ms: number): Promise<T> {
  const [res] = await Promise.all([p, new Promise(r => setTimeout(r, ms))]);
  return res;
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const ip = getClientIP(request.headers);
    const rlIp = checkRateLimit(`verify-email:ip:${ip}`, 5, 10 * 60_000);
    if (!rlIp.allowed) {
      return minTime(Promise.resolve(apiError("Demasiados intentos. Esperá unos minutos.", 429)), MIN_RESPONSE_MS);
    }

    if (!isConfigured()) {
      return apiError("Sistema no disponible", 503);
    }

    const body = await request.json();
    const rawEmail = typeof body?.email === "string" ? body.email : "";
    const email = rawEmail.trim().toLowerCase();

    if (!email || !email.includes("@") || email.length > 254) {
      return minTime(Promise.resolve(apiError("Email inválido", 400)), MIN_RESPONSE_MS);
    }

    const rlEmail = checkRateLimit(`verify-email:em:${email}`, 10, 10 * 60_000);
    if (!rlEmail.allowed) {
      return minTime(Promise.resolve(apiError("Demasiados intentos. Esperá unos minutos.", 429)), MIN_RESPONSE_MS);
    }

    const [partner, user] = await Promise.all([
      findPartnerByEmail(email, { customersOnly: true }),
      findPortalUserByEmail(email),
    ]);

    // Pad response to MIN_RESPONSE_MS so all branches look identical on the wire.
    const elapsed = Date.now() - started;
    const pad = Math.max(0, MIN_RESPONSE_MS - elapsed);
    if (pad > 0) await new Promise(r => setTimeout(r, pad));

    if (!partner) {
      // Never leak details. Frontend will show "no estás registrado como cliente".
      return apiSuccess({ exists: false, hasAccount: false });
    }

    // Partner exists in Odoo. hasAccount tells UI whether to show login or signup form.
    // NO devolver partner_id: el front no lo usa (login/signup resuelven el
    // partner server-side desde el email) y exponerlo facilitaba enumeracion.
    return apiSuccess({
      exists: true,
      hasAccount: !!user,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
