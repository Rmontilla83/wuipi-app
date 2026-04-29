// POST/GET /api/mercantil — alias del webhook que Mercantil registro sin /webhook.
//
// IMPORTANTE: este handler es DEBUG-FRIENDLY y permisivo. NO delega al strict
// handler de /api/mercantil/webhook (que tira 400 si falta `transactionData`)
// porque Mercantil podria estar mandando el body en otro formato (form, otro
// nombre de campo, etc) y necesitamos visibilidad sin perder el evento.
//
// Reglas:
//  1. SIEMPRE devuelve 200 — Mercantil no reintenta sobre 200, evitamos perder el evento.
//  2. Loggea body raw + headers a consola y a `payment_webhook_logs` para auditoria.
//  3. Intenta parseo en varios formatos: JSON, form-urlencoded, string cifrado.
//  4. Si logra descifrar via SDK, ejecuta el matching contra collection_items.
//  5. GET devuelve 200 (Mercantil a veces verifica existencia con GET).
//
// Es publica en middleware (exact match `/api/mercantil`) — no expone subrutas admin.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { decrypt } from "@/lib/mercantil/core/crypto";
import { configFromEnv, getAllSecretKeys } from "@/lib/mercantil/core/config";
import { markItemPaid, getItemByMercantilInvoiceId } from "@/lib/dal/collection-campaigns";
import { getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

// ---- Helpers de normalizacion (Web Button usa camelCase, SDK valida snake_case) ----

function pickField(raw: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (raw[n] !== undefined && raw[n] !== null && raw[n] !== "") return raw[n];
  }
  // Busca dentro de wrappers conocidos. webhookNotificationIn es el wrapper
  // del Boton Web (schema en espanol confirmado en logs 2026-04-29).
  for (const wrapper of [
    "webhookNotificationIn",
    "notification",
    "merchant_response",
    "transaction_response",
    "response",
    "data",
    "result",
  ]) {
    const inner = raw[wrapper];
    if (inner && typeof inner === "object") {
      const val = pickField(inner as Record<string, unknown>, ...names);
      if (val !== undefined) return val;
    }
  }
  return undefined;
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

interface NormalizedPayload {
  status: "approved" | "declined" | "error" | "pending";
  raw_status: string;
  invoice_number: string;
  reference_number: string;
  amount?: number;
  payment_method?: string;
  authorization_code?: string;
  message?: string;
  error_code?: string;
}

function normalizeWebhookPayload(raw: Record<string, unknown>): NormalizedPayload {
  // status: el Boton Web usa `codigo` ("00" = OPERACION EXITOSA).
  // Otros productos pueden usar `status`, `transactionStatus`, etc.
  const rawStatus = asString(
    pickField(raw, "status", "transactionStatus", "trxStatus", "transaction_status", "responseStatus", "codigo")
  );
  const sLower = rawStatus.toLowerCase();
  let status: NormalizedPayload["status"] = "pending";
  if (
    ["approved", "ok", "00", "000", "success", "successful", "completed", "aprobado", "exitoso"].includes(sLower)
  ) {
    status = "approved";
  } else if (["declined", "rejected", "fail", "failed", "denied", "rechazado"].includes(sLower)) {
    status = "declined";
  } else if (["error", "err"].includes(sLower)) {
    status = "error";
  }

  // invoice_number: puede ser string directo, objeto {number: ...}, o "numeroFactura"
  // (Boton Web: "numeroFactura" trae el WPY-XXXXXXXX que generamos).
  let invoice_number = "";
  const invoiceCandidate = pickField(raw, "invoice_number", "invoiceNumber", "invoice", "numeroFactura");
  if (typeof invoiceCandidate === "string") {
    invoice_number = invoiceCandidate;
  } else if (invoiceCandidate && typeof invoiceCandidate === "object") {
    const inner = (invoiceCandidate as Record<string, unknown>).number;
    if (typeof inner === "string") invoice_number = inner;
    else if (typeof inner === "number") invoice_number = String(inner);
  }

  // reference_number: Boton Web usa "referenciaBancoOrdenante".
  const reference_number = asString(
    pickField(
      raw,
      "reference_number", "referenceNumber", "paymentReference", "trxRef", "transactionId", "trxId",
      "referenciaBancoOrdenante", "referenciaBancoBeneficiario"
    )
  );

  // amount: Boton Web usa "monto" (string con decimales).
  const amtRaw = pickField(raw, "amount", "transactionAmount", "trxAmount", "monto");
  const amount =
    typeof amtRaw === "number" ? amtRaw : (typeof amtRaw === "string" && amtRaw ? parseFloat(amtRaw) : undefined);

  // payment_method: Boton Web usa "concepto" ("DEBITO INMEDIATO", "PAGO MOVIL", etc).
  const payment_method = asString(
    pickField(raw, "payment_method", "paymentMethod", "paymentConcept", "paymentType", "concepto")
  ) || undefined;

  const authorization_code = asString(
    pickField(raw, "authorization_code", "authorizationCode", "authCode")
  ) || undefined;

  // message: Boton Web usa "mensajeCliente" / "mensajeSistema".
  const message = asString(
    pickField(raw, "message", "responseMessage", "description", "errorMessage", "mensajeCliente", "mensajeSistema")
  ) || undefined;

  const error_code = asString(pickField(raw, "errorCode", "error_code", "responseCode", "code")) || undefined;

  return { status, raw_status: rawStatus, invoice_number, reference_number, amount, payment_method, authorization_code, message, error_code };
}

// GET — Mercantil a veces hace healthcheck. Solo confirma que el endpoint existe.
export async function GET() {
  return NextResponse.json(
    { ok: true, endpoint: "/api/mercantil", method: "GET" },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  const supabase = createAdminSupabase();
  const ip = getClientIP(request.headers);
  const headers = Object.fromEntries(request.headers);
  const contentType = request.headers.get("content-type") || "";

  // ---- 1. Capturar body crudo (solo se puede leer UNA vez) ----
  let rawText = "";
  try {
    rawText = await request.text();
  } catch (err) {
    console.error("[Mercantil Alias] Error leyendo body:", err);
  }

  console.log("[Mercantil Alias] === Webhook recibido ===");
  console.log("[Mercantil Alias] Method:", request.method);
  console.log("[Mercantil Alias] IP:", ip);
  console.log("[Mercantil Alias] Content-Type:", contentType);
  console.log("[Mercantil Alias] Headers:", JSON.stringify(headers));
  console.log("[Mercantil Alias] Body raw (length=" + rawText.length + "):", rawText.slice(0, 4000));

  // ---- 2. Audit log inmediato (antes de cualquier parseo) ----
  let logId: string | null = null;
  try {
    const { data: logRow } = await supabase
      .from("payment_webhook_logs")
      .insert({
        raw_payload: {
          _route: "/api/mercantil",
          _source_ip: ip,
          _content_type: contentType,
          _headers: headers,
          _body_text: rawText,
          _body_length: rawText.length,
        },
        received_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    logId = logRow?.id ?? null;
  } catch (err) {
    console.error("[Mercantil Alias] Error guardando audit log:", err);
  }

  // ---- 3. Intento multi-formato de parseo ----
  let parsedBody: Record<string, unknown> | null = null;
  let parseStrategy = "none";

  // 3a. JSON
  if (rawText) {
    try {
      const j = JSON.parse(rawText);
      if (j && typeof j === "object" && !Array.isArray(j)) {
        parsedBody = j as Record<string, unknown>;
        parseStrategy = "json";
      }
    } catch { /* not JSON */ }
  }

  // 3b. form-urlencoded
  if (!parsedBody && rawText && (contentType.includes("x-www-form-urlencoded") || rawText.includes("="))) {
    try {
      const params = new URLSearchParams(rawText);
      const obj: Record<string, unknown> = {};
      params.forEach((v, k) => { obj[k] = v; });
      if (Object.keys(obj).length > 0) {
        parsedBody = obj;
        parseStrategy = "form-urlencoded";
      }
    } catch { /* ignore */ }
  }

  // 3c. Body crudo cifrado (SDK puede descifrarlo como string)
  // Si no es JSON ni form, lo dejamos como null y le pasamos rawText al SDK abajo.

  console.log("[Mercantil Alias] Parse strategy:", parseStrategy);
  if (parsedBody) {
    console.log("[Mercantil Alias] Parsed keys:", Object.keys(parsedBody));
  }

  // Normaliza nombre del campo cifrado (puede venir como transactionData / transactiondata / data)
  if (parsedBody) {
    const lowerKeys: Record<string, string> = {};
    for (const k of Object.keys(parsedBody)) lowerKeys[k.toLowerCase()] = k;
    const candidates = ["transactiondata", "data", "encrypteddata"];
    for (const cand of candidates) {
      if (lowerKeys[cand] && lowerKeys[cand] !== "transactionData") {
        parsedBody.transactionData = parsedBody[lowerKeys[cand]];
      }
    }
  }

  // ---- 4. Descifrado manual + normalizacion (Web Button usa schema distinto al SDK) ----
  // El SDK valida payload.status / payload.invoice_number en snake_case, pero
  // Mercantil Web Button manda camelCase (invoiceNumber.number, transactionStatus, etc).
  // Aqui desciframos manualmente, logueamos las keys, y normalizamos campos
  // antes de hacer el matching contra collection_items.
  let processed = false;
  let processingError: string | null = null;
  let normalized: NormalizedPayload | null = null;
  let decryptedKeys: string[] = [];

  try {
    const ciphertext = parsedBody && typeof parsedBody.transactionData === "string"
      ? (parsedBody.transactionData as string)
      : rawText;

    if (!ciphertext) {
      processingError = "Body vacio o sin campo cifrado";
      console.warn("[Mercantil Alias] " + processingError);
    } else {
      const config = configFromEnv();
      const secretKeys = getAllSecretKeys(config);

      let decrypted: Record<string, unknown> | null = null;
      let usedKeyHint: string | null = null;
      for (const key of secretKeys) {
        try {
          const json = decrypt(ciphertext, key);
          const obj = JSON.parse(json);
          if (obj && typeof obj === "object" && !Array.isArray(obj)) {
            decrypted = obj as Record<string, unknown>;
            usedKeyHint = "len=" + key.length;
            break;
          }
        } catch { /* probar siguiente clave */ }
      }

      if (!decrypted) {
        processingError = "No se pudo descifrar con ninguna secretKey (" + secretKeys.length + " probadas)";
        console.warn("[Mercantil Alias] " + processingError);
      } else {
        decryptedKeys = Object.keys(decrypted);
        console.log("[Mercantil Alias] Descifrado OK con " + usedKeyHint);
        console.log("[Mercantil Alias] Keys descifradas:", decryptedKeys);
        // Loguea valores sanitizados para diagnostico (sin numeros de tarjeta)
        const sanitized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(decrypted)) {
          if (/card|pan|cvv/i.test(k)) sanitized[k] = "[redacted]";
          else sanitized[k] = typeof v === "object" ? "[object]" : v;
        }
        console.log("[Mercantil Alias] Sample:", JSON.stringify(sanitized).slice(0, 1500));

        normalized = normalizeWebhookPayload(decrypted);
        console.log(
          "[Mercantil Alias] Normalizado | status=" + normalized.status +
          " (raw=" + normalized.raw_status + ")" +
          " invoice=" + normalized.invoice_number +
          " ref=" + normalized.reference_number +
          (normalized.error_code ? " errorCode=" + normalized.error_code : "")
        );

        // Idempotencia por reference_number (si tiene)
        if (normalized.reference_number) {
          const { data: prior } = await supabase
            .from("payment_webhook_logs")
            .select("id")
            .eq("reference_number", normalized.reference_number)
            .eq("processed", true)
            .limit(1);
          if (prior && prior.length > 0) {
            console.log("[Mercantil Alias] Duplicate ref " + normalized.reference_number + " — skipping");
            if (logId) {
              await supabase
                .from("payment_webhook_logs")
                .update({ processing_error: "duplicate (already processed)" })
                .eq("id", logId);
            }
            return NextResponse.json(
              { received: true, duplicate: true, reference: normalized.reference_number },
              { status: 200 }
            );
          }
        }

        // Marcar item de cobranza como pagado si status approved y tenemos invoice
        if (normalized.status === "approved" && normalized.invoice_number) {
          // Primero por mercantil_invoice_id (WPY-XXXXXXXX corto generado por nosotros)
          let item = await getItemByMercantilInvoiceId(normalized.invoice_number);

          // Fallback: por invoice_number Odoo o por payment_token
          if (!item) {
            const { data: items } = await supabase
              .from("collection_items")
              .select("*")
              .or(`invoice_number.eq.${normalized.invoice_number},payment_token.eq.${normalized.invoice_number}`)
              .in("status", ["pending", "sent", "viewed"])
              .limit(1);
            item = items && items[0] ? items[0] : null;
          }

          if (item) {
            await markItemPaid(item.payment_token, {
              payment_method: "debito_inmediato",
              payment_reference: normalized.reference_number || "",
              amount_bss: normalized.amount,
            });
            console.log("[Mercantil Alias] Item " + item.id + " marcado como paid");
            processed = true;
          } else {
            processingError = "No se encontro item para invoice " + normalized.invoice_number;
            console.warn("[Mercantil Alias] " + processingError);
          }
        } else if (normalized.status !== "approved") {
          // No-approved: solo loggea, no toca items
          processingError = "Status no aprobado: " + normalized.raw_status +
            (normalized.error_code ? " (code=" + normalized.error_code + ")" : "");
        }

        // Actualiza el audit log con la info normalizada
        if (logId) {
          await supabase
            .from("payment_webhook_logs")
            .update({
              invoice_number: normalized.invoice_number || null,
              status: normalized.raw_status || null,
              payment_method: normalized.payment_method || null,
              reference_number: normalized.reference_number || null,
              amount: normalized.amount || null,
              processed,
            })
            .eq("id", logId);
        }
      }
    }
  } catch (err) {
    processingError = err instanceof Error ? err.message : "Error desconocido";
    console.error("[Mercantil Alias] Error procesando:", err);
  }

  // ---- 5. Persistir error de procesamiento si hubo ----
  if (processingError && logId) {
    try {
      await supabase
        .from("payment_webhook_logs")
        .update({ processing_error: processingError })
        .eq("id", logId);
    } catch { /* ignore */ }
  }

  // ---- 6. SIEMPRE 200 ----
  return NextResponse.json(
    {
      received: true,
      processed,
      parse_strategy: parseStrategy,
      decrypted_keys: decryptedKeys,
      ...(normalized ? { status: normalized.status, raw_status: normalized.raw_status } : {}),
    },
    { status: 200 }
  );
}
