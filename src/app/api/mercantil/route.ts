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
import { MercantilSDK } from "@/lib/mercantil";
import { markItemPaid, getItemByMercantilInvoiceId } from "@/lib/dal/collection-campaigns";
import { getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

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

  // ---- 4. Intentar procesar via SDK — nunca fallar la respuesta ----
  let processed = false;
  let processingError: string | null = null;
  let parsedPayload: Record<string, unknown> | null = null;

  try {
    const sdk = new MercantilSDK();
    if (sdk.isConfigured) {
      // Si tenemos parsedBody con transactionData → pasa el objeto.
      // Si no, pasa el rawText como string (SDK intenta descifrar string crudo).
      const input: string | Record<string, unknown> =
        parsedBody && parsedBody.transactionData ? parsedBody : rawText;

      if (input && (typeof input === "string" ? input.length > 0 : Object.keys(input).length > 0)) {
        const payload = sdk.parseWebhook(input as Record<string, unknown>);
        parsedPayload = payload as unknown as Record<string, unknown>;
        console.log(
          "[Mercantil Alias] Payload descifrado | status=" + payload.status +
          " invoice=" + payload.invoice_number +
          " ref=" + payload.reference_number
        );

        // Idempotencia por reference_number
        if (payload.reference_number) {
          const { data: prior } = await supabase
            .from("payment_webhook_logs")
            .select("id")
            .eq("reference_number", payload.reference_number)
            .eq("processed", true)
            .limit(1);
          if (prior && prior.length > 0) {
            console.log("[Mercantil Alias] Duplicate ref " + payload.reference_number + " — skipping");
            if (logId) {
              await supabase
                .from("payment_webhook_logs")
                .update({ processing_error: "duplicate (already processed)" })
                .eq("id", logId);
            }
            return NextResponse.json(
              { received: true, duplicate: true, reference: payload.reference_number },
              { status: 200 }
            );
          }
        }

        // Marcar item de cobranza como pagado si encontramos match
        if (payload.status === "approved" && payload.invoice_number) {
          // Primero por mercantil_invoice_id (WPY-XXXXXXXX)
          let item = await getItemByMercantilInvoiceId(payload.invoice_number);

          // Fallback: por invoice_number directo o payment_token
          if (!item) {
            const { data: items } = await supabase
              .from("collection_items")
              .select("*")
              .or(`invoice_number.eq.${payload.invoice_number},payment_token.eq.${payload.invoice_number}`)
              .in("status", ["pending", "sent", "viewed"])
              .limit(1);
            item = items && items[0] ? items[0] : null;
          }

          if (item) {
            await markItemPaid(item.payment_token, {
              payment_method: "debito_inmediato",
              payment_reference: payload.reference_number || "",
              amount_bss: payload.amount ? parseFloat(String(payload.amount)) : undefined,
            });
            console.log("[Mercantil Alias] Item " + item.id + " marcado como paid");
            processed = true;
          } else {
            console.warn("[Mercantil Alias] No se encontro item para invoice " + payload.invoice_number);
          }
        }

        // Actualiza el audit log con la info parseada
        if (logId) {
          await supabase
            .from("payment_webhook_logs")
            .update({
              invoice_number: payload.invoice_number,
              status: payload.status,
              payment_method: payload.payment_method,
              reference_number: payload.reference_number,
              amount: payload.amount,
              processed,
            })
            .eq("id", logId);
        }
      } else {
        processingError = "Body vacio o sin transactionData";
        console.warn("[Mercantil Alias] " + processingError);
      }
    } else {
      processingError = "SDK no configurado";
      console.warn("[Mercantil Alias] " + processingError);
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
      ...(parsedPayload ? { status: parsedPayload.status } : {}),
    },
    { status: 200 }
  );
}
