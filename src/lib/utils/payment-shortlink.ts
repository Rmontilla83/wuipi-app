// ============================================================
// Payment Shortlink — verificación del JWT firmado por Odoo
// (módulo wuipi_campaigns) usando el secret compartido
// WUIPI_PAYMENT_JWT_SECRET.
//
// Spec del JWT (definida en el brief al módulo Odoo):
//  - Algoritmo: HS256
//  - Payload: { partner_id: int, code: string, iat: int, exp: int, jti?: string }
//  - Secret: env var WUIPI_PAYMENT_JWT_SECRET (sincronizado con Odoo)
// ============================================================

import crypto from "crypto";

export interface ShortlinkJWTPayload {
  partner_id: number;
  code: string;
  iat: number;
  exp: number;
  jti?: string;
}

export type VerifyResult =
  | { ok: true; payload: ShortlinkJWTPayload }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "expired" | "code_mismatch" | "invalid_payload" };

/**
 * Verifica un JWT de shortlink firmado por Odoo.
 *
 * @param token  El jwt_token completo del shortlink (3 partes separadas por punto)
 * @param expectedCode  Si se pasa, valida que payload.code === expectedCode
 *                      (sanity check: el code de la URL debe matchear el del JWT)
 */
export function verifyShortlinkJWT(token: string, expectedCode?: string): VerifyResult {
  const secret = process.env.WUIPI_PAYMENT_JWT_SECRET;
  if (!secret || secret.length < 16) {
    return { ok: false, reason: "no_secret" };
  }

  if (!token || typeof token !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed" };
  }
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    return { ok: false, reason: "malformed" };
  }

  // Verificar firma HMAC-SHA256 con el secret compartido
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  try {
    const a = Buffer.from(sigB64, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: "bad_signature" };
    }
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  // Decodificar payload
  let payload: ShortlinkJWTPayload;
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    payload = JSON.parse(json) as ShortlinkJWTPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof payload?.partner_id !== "number" ||
    payload.partner_id <= 0 ||
    typeof payload?.code !== "string" ||
    !payload.code ||
    typeof payload?.exp !== "number"
  ) {
    return { ok: false, reason: "invalid_payload" };
  }

  // Validar expiración
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { ok: false, reason: "expired" };
  }

  // Sanity check: el code de la URL debe coincidir con el del JWT
  if (expectedCode && payload.code !== expectedCode) {
    return { ok: false, reason: "code_mismatch" };
  }

  return { ok: true, payload };
}

/**
 * Mensaje user-friendly para cada motivo de falla de verificación.
 */
export function shortlinkErrorMessage(reason: Exclude<VerifyResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "no_secret":
      return "Sistema mal configurado. Contacta a soporte.";
    case "malformed":
    case "invalid_payload":
    case "bad_signature":
      return "Enlace no válido. Pide uno nuevo a soporte.";
    case "code_mismatch":
      return "Enlace inconsistente. Pide uno nuevo a soporte.";
    case "expired":
      return "Este enlace ya expiró. Pide uno nuevo o entra a tu portal en api.wuipi.net";
  }
}

/**
 * Formato esperado del shortlink code generado por el módulo Odoo:
 * 6-12 chars alfanuméricos (URL-safe, sin guiones ni símbolos). El brief
 * sugirió 8 chars (ej. "mJXjbQ7O" o "4M6J7mcd").
 *
 * Esto sirve para distinguir un shortlink de un payment token legacy
 * (formato `wpy_[hex]{16,64}`).
 */
export function isShortlinkCode(value: string): boolean {
  return /^[a-zA-Z0-9]{6,12}$/.test(value) && !value.startsWith("wpy_");
}
