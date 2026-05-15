// Portal Session — sistema de sesión propio para el portal de cliente
//
// Razón de ser: Supabase Auth requiere un flujo OTP que pasa por /auth/confirm,
// setea Set-Cookie, y depende de que el browser (en este caso, casi siempre el
// in-app webview de WhatsApp) propague esas cookies en el redirect siguiente.
// El webview de WA es inconsistente: a veces no persiste cookies entre
// requests, a veces cachea redirects 307 sin importar Cache-Control,
// a veces ni ejecuta JS confiablemente.
//
// Solución: cuando el cliente consume un invite-token desde WA, le entregamos
// DIRECTAMENTE una cookie firmada con HMAC que contiene su partnerId. El
// portal y los endpoints /api/portal/* validan esa cookie sin tocar Supabase.
//
// La cookie es HttpOnly + Secure + SameSite=Lax. El secreto se rota junto al
// PAYMENT_TOKEN_SECRET. Si en algún momento queremos invalidar todas las
// sesiones portales, rotar la env la invalida en masa.

import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const PORTAL_SESSION_COOKIE = "wpi_session";

// 30 días — alineado con la decisión de OTP expiration original. Lo
// suficientemente largo para que un cliente que recibió la invitación hace
// semanas siga entrando sin re-pedir nada.
const TTL_SECONDS = 30 * 24 * 60 * 60;

function getSecret(): string {
  const s = process.env.PAYMENT_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error("PAYMENT_TOKEN_SECRET env var is required (min 32 chars)");
  }
  return s;
}

export interface PortalSessionPayload {
  /** Odoo res.partner id */
  pid: number;
  /** Customer name (cached del Odoo lookup en el invite) */
  name?: string;
  /** Email (cached) */
  email?: string;
  /** Unix epoch seconds */
  exp: number;
  /** Issued at — para auditoría/rotación futura */
  iat: number;
}

function sign(payload: PortalSessionPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(`portal-session-v1.${b64}`)
    .digest("base64url")
    .slice(0, 32); // 192 bits es más que suficiente
  return `${b64}.${sig}`;
}

function verify(token: string): PortalSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  if (!b64 || !sig) return null;

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(`portal-session-v1.${b64}`)
    .digest("base64url")
    .slice(0, 32);

  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as PortalSessionPayload;
    if (!payload || typeof payload.pid !== "number" || payload.pid <= 0) return null;
    if (typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expirada
    return payload;
  } catch {
    return null;
  }
}

interface CookieMutator {
  set: (name: string, value: string, options: Record<string, unknown>) => void;
}

/**
 * Setear la cookie de sesión portal en una NextResponse (redirect o JSON).
 * Usar después de validar un invite-token o cualquier flujo que autentique
 * al cliente sin Supabase.
 */
export function setPortalSession(
  responseCookies: CookieMutator,
  data: { pid: number; name?: string; email?: string }
): void {
  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    pid: data.pid,
    name: data.name,
    email: data.email,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  responseCookies.set(PORTAL_SESSION_COOKIE, sign(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * Limpiar la cookie de portal session (logout).
 */
export function clearPortalSession(responseCookies: CookieMutator): void {
  responseCookies.set(PORTAL_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Leer la sesión portal desde un Server Component o Route Handler usando
 * el helper `cookies()` de next/headers. Devuelve null si no hay cookie,
 * está expirada, o el HMAC no valida.
 */
export function getPortalSessionFromCookieJar(): PortalSessionPayload | null {
  try {
    const c = cookies().get(PORTAL_SESSION_COOKIE);
    if (!c?.value) return null;
    return verify(c.value);
  } catch {
    // cookies() throws si se llama fuera de contexto request — devolver null
    return null;
  }
}

/**
 * Variante para leer desde un NextRequest (middleware o handler).
 */
export function getPortalSessionFromRequest(request: NextRequest | Request): PortalSessionPayload | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|; )${PORTAL_SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return verify(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

/**
 * Variante para setear en un Server Component / Route Handler que usa
 * `cookies()` (next/headers) en lugar de un NextResponse — útil cuando
 * el handler no devuelve una redirect sino que es una página normal.
 */
export function setPortalSessionFromCookieJar(data: {
  pid: number;
  name?: string;
  email?: string;
}): void {
  const now = Math.floor(Date.now() / 1000);
  const payload: PortalSessionPayload = {
    pid: data.pid,
    name: data.name,
    email: data.email,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  cookies().set(PORTAL_SESSION_COOKIE, sign(payload), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

// Wrapper para usar con NextResponse — facilita uso en route handlers que
// hacen redirects con NextResponse.redirect(url).
export function setPortalSessionOnResponse(
  response: NextResponse,
  data: { pid: number; name?: string; email?: string }
): void {
  setPortalSession(response.cookies, data);
}

export function clearPortalSessionOnResponse(response: NextResponse): void {
  clearPortalSession(response.cookies);
}
