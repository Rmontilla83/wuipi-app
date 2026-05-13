// ============================================================
// payment_gateway_logs — DAL helper
// ============================================================
//
// Helper unico para loguear eventos de pasarelas de pago. Aplica whitelist
// por gateway y masking sobre datos sensibles antes de escribir a la tabla
// payment_gateway_logs.
//
// Politica de privacidad (sin negociacion):
//  - Whitelist explicito por gateway: lo que no este aqui NO se loggea
//  - OTPs, tokens auth, encrypted blobs: nunca al log (FORBIDDEN_KEYS)
//  - Cedulas/RIFs: enmascarados (primeros 3 + ultimos 2)
//  - Telefonos/cuentas/cards: solo last 4
//  - Emails: parcial (r****l@dominio)
//
// Uso:
//   await logGatewayEvent({
//     collectionItemId: item.id,
//     paymentToken: item.payment_token,
//     gateway: "mercantil",
//     gatewayProduct: "web_button",
//     eventType: "request_sent",
//     request: payloadAlSDK,
//     ip: getClientIP(headers),
//   });
//
// El llamado nunca lanza — loguear es best-effort, no bloquea el flujo
// principal de pago.

import { createAdminSupabase } from "@/lib/supabase/server";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type Gateway = "mercantil" | "c2p" | "stripe" | "paypal" | "transferencia" | "cash";

export type EventType =
  | "initiated"
  | "request_sent"
  | "response_received"
  | "webhook_received"
  | "success"
  | "error"
  | "timeout"
  | "abandoned";

export type Outcome = "success" | "error" | "pending";

export type ErrorCategory =
  | "intra_bank_limit"        // Mercantil errorCode 4025 (Boton Web → Mercantil)
  | "insufficient_funds"
  | "invalid_otp"
  | "invalid_credentials"
  | "amount_mismatch"         // trx existe en pasarela pero por monto distinto al adeudado
  | "timeout"
  | "rate_limited"
  | "gateway_5xx"
  | "unknown";

export interface LogGatewayEventInput {
  collectionItemId?: string | null;
  paymentToken?: string | null;

  gateway: Gateway;
  /** Ej: 'web_button', 'debito_inmediato', 'c2p_otp_request', 'c2p_payment',
   *  'stripe_checkout', 'paypal_order', 'transfer_search', 'office_collect' */
  gatewayProduct?: string | null;

  eventType: EventType;
  outcome?: Outcome | null;

  /** Request payload bruto. Se aplicara whitelist + sanitizer antes de escribir */
  request?: unknown;
  /** Response payload bruto. Misma sanitizacion */
  response?: unknown;

  responseCode?: string | null;
  responseMessage?: string | null;
  errorCategory?: ErrorCategory | null;

  ip?: string | null;
  userAgent?: string | null;
  durationMs?: number | null;

  /** Cedula/RIF del cliente — se enmascara antes de escribir */
  customerCedulaRif?: string | null;
  customerName?: string | null;
  amountUsd?: number | null;
  amountVes?: number | null;
}

// ------------------------------------------------------------
// Whitelist por gateway — fuente de verdad de privacidad
// ------------------------------------------------------------

interface FieldsWhitelist {
  request: string[];
  response: string[];
}

/**
 * Define exactamente que campos viajan al log. Lo que no este aqui se
 * descarta antes del INSERT. Soporta dot-notation para acceder a campos
 * anidados (`last_payment_error.code`).
 *
 * IMPORTANTE: agregar campos solo despues de revisar privacidad. Si tienes
 * dudas, no lo agregues — falta de log es preferible a fuga de datos.
 */
const SAFE_FIELDS_BY_GATEWAY: Record<Gateway, FieldsWhitelist> = {
  mercantil: {
    // Request al endpoint Mercantil (Boton Web, C2P via Mercantil, etc.)
    request: [
      "amount", "currency", "invoiceNumber", "integratorId", "merchantId",
      "description", "twoStepPayment", "responseUrl", "merchantTransactionId",
    ],
    response: [
      "errorCode", "errorMessage", "paymentResult", "transactionId", "status",
      "redirectUrl",
    ],
  },
  c2p: {
    request: [
      "amount", "bankCode", "invoiceNumber",
      // cedula y phone NO van directo — se loguean via campos del input enmascarados
      // OTP NUNCA va al log (esta en FORBIDDEN_KEYS tambien por defensa)
    ],
    response: [
      "errorCode", "errorMessage", "transactionId", "reference", "status",
      "authorizationCode",
    ],
  },
  stripe: {
    request: [
      "amount", "currency", "invoice_id", "mode", "customer_email_masked",
    ],
    response: [
      "payment_intent_id", "session_id", "status",
      "last_payment_error.code", "last_payment_error.message",
    ],
  },
  paypal: {
    request: [
      "amount", "currency", "order_id", "invoice_id", "intent",
    ],
    response: [
      "order_id", "status", "payer_email_masked", "capture_id",
    ],
  },
  transferencia: {
    request: [
      "amount", "reference_number", "account_last4", "bank_code", "date",
    ],
    response: [
      "matched", "odoo_invoice_id", "verified_by_user_id",
    ],
  },
  cash: {
    request: [
      "amount", "currency", "collected_by_user_id", "office",
    ],
    response: [
      "ok", "odoo_payment_id",
    ],
  },
};

// ------------------------------------------------------------
// Forbidden keys — defensa adicional contra fugas accidentales
// ------------------------------------------------------------

const FORBIDDEN_KEYS = [
  // Auth / secrets
  "authorization", "bearer", "apikey", "api_key", "access_token",
  "refresh_token", "secret", "password", "passhash", "client_secret",
  // OTP / 2FA
  "otp", "verification_code", "claveotp", "twilio_code",
  // Card sensitive
  "card_number", "pan", "cvv", "cvc", "card_pan", "card_holder",
  // Encrypted / raw blobs
  "transactiondata", "encrypted_data", "cipher", "ciphertext",
];

function isForbiddenKey(key: string): boolean {
  const k = key.toLowerCase();
  return FORBIDDEN_KEYS.some(f => k.includes(f));
}

// ------------------------------------------------------------
// Maskers — exportados para usarse desde callers cuando quieran
// loggear datos sensibles ya enmascarados directamente
// ------------------------------------------------------------

/**
 * Phone: enmascarado dejando los ultimos 4 visibles cuando hay >=8 digitos.
 *  04141234567   -> 0414***4567
 *  584141234567  -> 5841****4567
 *  04129441604   -> 0412***1604
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "***";
  if (digits.length <= 7) return digits.slice(0, 2) + "***" + digits.slice(-2);
  return digits.slice(0, 4) + "*".repeat(Math.max(3, digits.length - 8)) + digits.slice(-4);
}

/**
 * Cedula/RIF: prefijo V/J/E/G/P + primeros 3 digitos + ultimos 2.
 *  V-16006905     -> V-160***05
 *  J-411567710    -> J-411***10
 *  16006905       -> 160***05
 *  V12345         -> V-1***45
 */
export function maskCedula(cedula: string | null | undefined): string {
  if (!cedula) return "";
  const s = String(cedula).trim();
  const withPrefix = s.match(/^([VJEGPvjegp])-?(\d+)$/);
  if (withPrefix) {
    const prefix = withPrefix[1].toUpperCase();
    const digits = withPrefix[2];
    if (digits.length <= 4) return `${prefix}-${digits.slice(0, 1)}***`;
    return `${prefix}-${digits.slice(0, 3)}***${digits.slice(-2)}`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length <= 4) return digits.slice(0, 1) + "***";
  return digits.slice(0, 3) + "***" + digits.slice(-2);
}

/**
 * Email: deja primero y ultimo char del local-part visibles + dominio entero.
 *  rafael@wuipi.net -> r****l@wuipi.net
 *  a@b.com          -> a***@b.com
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const s = String(email).trim().toLowerCase();
  const at = s.indexOf("@");
  if (at < 1 || at === s.length - 1) return "***";
  const local = s.slice(0, at);
  const domain = s.slice(at);
  if (local.length <= 2) return local[0] + "***" + domain;
  return local[0] + "***" + local.slice(-1) + domain;
}

/**
 * Account/card number: solo ultimos 4 digitos.
 *  01050745651745103031 -> ****3031
 *  4532...1234           -> ****1234
 */
export function maskAccountLast4(account: string | null | undefined): string {
  if (!account) return "";
  const digits = String(account).replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return "****" + digits.slice(-4);
}

// ------------------------------------------------------------
// Sanitizer — aplica whitelist con dot-notation
// ------------------------------------------------------------

/**
 * Recorre el whitelist y copia SOLO los campos permitidos del payload.
 * Soporta dot-notation: "last_payment_error.code" copia ese sub-campo
 * preservando la estructura.
 *
 * Si encuentra una FORBIDDEN_KEY en el path, descarta el campo entero
 * (defensa adicional).
 */
function pickWhitelist(payload: unknown, whitelist: string[]): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const src = payload as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const path of whitelist) {
    const parts = path.split(".");
    if (parts.some(isForbiddenKey)) continue;

    // Resolver el valor en el source
    let srcRef: unknown = src;
    let found = true;
    for (const p of parts) {
      if (srcRef && typeof srcRef === "object" && !Array.isArray(srcRef)
          && p in (srcRef as Record<string, unknown>)) {
        srcRef = (srcRef as Record<string, unknown>)[p];
      } else {
        found = false;
        break;
      }
    }
    if (!found || srcRef === undefined) continue;

    // Set en result preservando el path
    if (parts.length === 1) {
      result[parts[0]] = srcRef;
    } else {
      let dst: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!(p in dst) || typeof dst[p] !== "object" || dst[p] === null) {
          dst[p] = {};
        }
        dst = dst[p] as Record<string, unknown>;
      }
      dst[parts[parts.length - 1]] = srcRef;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Loggea un evento de pasarela. Aplica whitelist + masking automaticamente.
 *
 * Nunca lanza — los errores se logean a console.error pero no se propagan.
 * El llamado puede hacerse fire-and-forget desde el flujo de pago principal.
 */
export async function logGatewayEvent(input: LogGatewayEventInput): Promise<void> {
  try {
    const sb = createAdminSupabase();
    const wl = SAFE_FIELDS_BY_GATEWAY[input.gateway];

    const requestSafe = input.request !== undefined && input.request !== null && wl
      ? pickWhitelist(input.request, wl.request)
      : null;
    const responseSafe = input.response !== undefined && input.response !== null && wl
      ? pickWhitelist(input.response, wl.response)
      : null;

    const row = {
      collection_item_id: input.collectionItemId ?? null,
      payment_token: input.paymentToken ?? null,

      gateway: input.gateway,
      gateway_product: input.gatewayProduct ?? null,

      event_type: input.eventType,
      outcome: input.outcome ?? null,

      request_payload: requestSafe,
      response_payload: responseSafe,
      response_code: input.responseCode ?? null,
      response_message: input.responseMessage ?? null,

      error_category: input.errorCategory ?? null,

      ip_address: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      duration_ms: input.durationMs ?? null,

      customer_cedula_rif: input.customerCedulaRif ? maskCedula(input.customerCedulaRif) : null,
      customer_name: input.customerName ?? null,
      amount_usd: input.amountUsd ?? null,
      amount_ves: input.amountVes ?? null,
    };

    const { error } = await sb.from("payment_gateway_logs").insert(row);
    if (error) {
      console.error("[logGatewayEvent] insert failed:", error.message, {
        gateway: input.gateway,
        eventType: input.eventType,
      });
    }
  } catch (err) {
    console.error("[logGatewayEvent] exception:", err);
  }
}

/**
 * Mapea codigo bruto de la pasarela a categoria normalizada para dashboards.
 * Permite agregaciones sin parsear strings cada vez. Usar en el caller para
 * pasar el `errorCategory` al `logGatewayEvent`.
 *
 * Reglas conocidas:
 *  - Mercantil 4025 -> intra_bank_limit (cuenta emisor tambien Mercantil)
 *  - Mercantil 99999 -> unknown (operativo "consultar al banco")
 *  - Mercantil 821 -> invalid_credentials
 *  - C2P "OTP invalido"/"clave equivocada" -> invalid_otp
 *  - HTTP 5xx -> gateway_5xx
 *  - "timeout"/"timed out" -> timeout
 */
export function classifyError(
  gateway: Gateway,
  code: string | null | undefined,
  message?: string | null,
): ErrorCategory | null {
  if (!code && !message) return null;
  const c = String(code || "").trim();
  const m = String(message || "").toLowerCase();

  // Mercantil-specific
  if (gateway === "mercantil") {
    if (c === "00") return null;  // success
    if (c === "4025" || m.includes("intra")) return "intra_bank_limit";
    if (c === "99999") return "unknown";
    if (c === "821") return "invalid_credentials";
    if (m.includes("insufficient") || m.includes("fondos")) return "insufficient_funds";
  }

  // C2P
  if (gateway === "c2p") {
    if (m.includes("otp") || m.includes("clave")) return "invalid_otp";
    if (m.includes("insufficient") || m.includes("fondos")) return "insufficient_funds";
  }

  // Genericos (todos los gateways)
  if (m.includes("timeout") || m.includes("timed out")) return "timeout";
  if (m.includes("rate") && m.includes("limit")) return "rate_limited";
  if (/^5\d{2}$/.test(c)) return "gateway_5xx";
  if (m.includes("credenciales") || m.includes("credentials") || m.includes("unauthorized")) {
    return "invalid_credentials";
  }

  return c || m ? "unknown" : null;
}
