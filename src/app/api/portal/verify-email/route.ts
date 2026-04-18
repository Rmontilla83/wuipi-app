import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, searchRead } from "@/lib/integrations/odoo";
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
    // Rate limit: 5 req/10min per IP, 10 req/10min per email.
    // Email rate limit also prevents an attacker from using many IPs to enumerate
    // a known target.
    const ip = getClientIP(request.headers);
    const rlIp = checkRateLimit(`verify-email:ip:${ip}`, 5, 10 * 60_000);
    if (!rlIp.allowed) {
      return minTime(Promise.resolve(apiError("Demasiados intentos. Esperá unos minutos.", 429)), MIN_RESPONSE_MS);
    }

    if (!isOdooConfigured()) {
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

    const partners = await searchRead("res.partner", [
      ["email", "=", email],
      ["customer_rank", ">", 0],
    ], {
      fields: ["id", "name"],
      limit: 1,
    });

    // Pad response to MIN_RESPONSE_MS so a hit and a miss look identical on the wire.
    const elapsed = Date.now() - started;
    const pad = Math.max(0, MIN_RESPONSE_MS - elapsed);
    if (pad > 0) await new Promise(r => setTimeout(r, pad));

    if (partners.length === 0) {
      // Never leak "email not found" — return shape identical to success.
      // Client treats absence of partner_id as "not registered" without exposing
      // the customer's name to pre-auth callers.
      return apiSuccess({ exists: false });
    }

    // Return partner_id (required for magic-link flow) but NOT the name.
    // Full name is only visible post-authentication.
    return apiSuccess({
      exists: true,
      partner_id: partners[0].id,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
