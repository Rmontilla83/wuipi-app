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
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { decrypt } from "@/lib/mercantil/core/crypto";
import { configFromEnv, getAllSecretKeys } from "@/lib/mercantil/core/config";
import { markItemPaid, getItemByMercantilInvoiceId } from "@/lib/dal/collection-campaigns";
import { getClientIP } from "@/lib/utils/rate-limit";
import { triggerOdooSyncOrEnqueue, extractInvoiceSyncFields } from "@/lib/integrations/odoo-sync-trigger";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { logGatewayEvent, classifyError } from "@/lib/dal/payment-gateway-logs";
import { createPaymentFailureCase, closeOpenCasesForPaidItem } from "@/lib/cobranzas/payment-failure-case";

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
            // Sanitizar antes de interpolar en .or(): quitar caracteres con
            // significado en filtros PostgREST (coma separa condiciones,
            // parentesis agrupan) para evitar inyeccion de operadores via el
            // campo descifrado del webhook. Los valores legitimos (WPY-XXXX,
            // numero Odoo, token wpy_hex) no contienen estos caracteres.
            const safeInv = String(normalized.invoice_number).replace(/[,()]/g, "");
            const { data: items } = await supabase
              .from("collection_items")
              .select("*")
              .or(`invoice_number.eq.${safeInv},payment_token.eq.${safeInv}`)
              .in("status", ["pending", "sent", "viewed"])
              .limit(1);
            item = items && items[0] ? items[0] : null;
          }

          if (item) {
            // ── C2 (auditoría de seguridad 2026-06-05) — VALIDAR EL MONTO ────────────
            // Antes se marcaba la factura como pagada usando el `amount` que venía en el
            // webhook, SIN compararlo nunca con lo que el cliente debía: un pago aprobado
            // por menos de lo debido cerraba la factura COMPLETA.
            // `item.amount_bss` es el monto que NOSOTROS le pedimos cobrar a Mercantil
            // (lo fija /api/cobranzas/pay justo antes de crear el pago) y aquí el item
            // sigue en pending/sent/viewed, así que este webhook todavía no lo sobrescribió.
            const expectedBs = Number(item.amount_bss);
            const receivedBs = Number(normalized.amount);
            const TOLERANCIA_BS = 0.05; // céntimos por formato/redondeo de la pasarela

            const noValidable = !Number.isFinite(expectedBs) || expectedBs <= 0
              || !Number.isFinite(receivedBs) || receivedBs <= 0;
            const insuficiente = !noValidable && receivedBs < expectedBs - TOLERANCIA_BS;

            if (noValidable || insuficiente) {
              const motivo = noValidable
                ? `monto no validable (esperado=${item.amount_bss} recibido=${normalized.amount})`
                : `MONTO INSUFICIENTE: recibido ${receivedBs} Bs < esperado ${expectedBs} Bs`;
              console.error(
                "[Mercantil Alias] ⛔ NO se marca pagado " + item.payment_token + ": " + motivo
              );
              logGatewayEvent({
                collectionItemId: item.id, paymentToken: item.payment_token,
                gateway: "mercantil", gatewayProduct: "web_button",
                eventType: "webhook_received", outcome: "error",
                responseMessage: motivo,
                response: {
                  status: normalized.raw_status,
                  errorCode: normalized.error_code || null,
                  transactionId: normalized.reference_number || null,
                  expectedBs: item.amount_bss ?? null,
                },
                responseCode: normalized.raw_status || null,
                ip,
                amountVes: normalized.amount ?? null,
                customerCedulaRif: item.customer_cedula_rif,
                customerName: item.customer_name,
                amountUsd: Number(item.amount_usd),
              }).catch(() => {});
              if (logId) {
                await supabase
                  .from("payment_webhook_logs")
                  .update({ processing_error: motivo })
                  .eq("id", logId);
              }
              // 200 para que Mercantil no reintente en bucle. El item queda SIN pagar y
              // el evento queda registrado para revisión.
              return NextResponse.json(
                { received: true, amount_mismatch: true },
                { status: 200 }
              );
            }
            if (receivedBs > expectedBs + TOLERANCIA_BS) {
              // Sobrepago: no es un riesgo (el cliente pagó de más) pero debe verse.
              console.warn(
                "[Mercantil Alias] ⚠️ SOBREPAGO " + item.payment_token
                + ": recibido " + receivedBs + " Bs > esperado " + expectedBs + " Bs"
              );
            }

            const paidResult = await markItemPaid(item.payment_token, {
              payment_method: "debito_inmediato",
              payment_reference: normalized.reference_number || "",
              amount_bss: normalized.amount,
            });
            const wasAlreadyPaid = (paidResult as { wasAlreadyPaid?: boolean }).wasAlreadyPaid === true;

            // Log webhook approved (success) — solo si fuimos los primeros en
            // ganar la race (sino el primer webhook ya logeo este evento)
            if (!wasAlreadyPaid) {
              logGatewayEvent({
                collectionItemId: item.id, paymentToken: item.payment_token,
                gateway: "mercantil", gatewayProduct: "web_button",
                eventType: "webhook_received", outcome: "success",
                response: {
                  status: normalized.raw_status,
                  errorCode: normalized.error_code || null,
                  transactionId: normalized.reference_number || null,
                },
                responseCode: normalized.raw_status || null,
                ip,
                amountVes: normalized.amount ?? null,
                customerCedulaRif: item.customer_cedula_rif,
                customerName: item.customer_name,
                amountUsd: Number(item.amount_usd),
              }).catch(() => {});

              // Cerrar caso(s) abierto(s) en kanban si los hay (cliente
              // habia tenido fallo previo y eventualmente pago)
              closeOpenCasesForPaidItem(item.id).catch(err =>
                console.error("[Mercantil Alias] closeOpenCasesForPaidItem fallo:", err)
              );
            }
            if (wasAlreadyPaid) {
              console.log("[Mercantil Alias] Item " + item.id + " ya estaba paid — skip notificaciones y sync (otro webhook lo proceso primero)");
            } else {
              console.log("[Mercantil Alias] Item " + item.id + " marcado como paid (primer webhook gano la race)");
            }
            processed = true;

            // Solo notificar y sync si fuimos los primeros en marcarlo paid.
            // Sino, otro webhook concurrente ya hizo todo eso.
            if (!wasAlreadyPaid) {
              // El template de WhatsApp Meta tiene "$" hardcoded despues de {{amount}}.
              // Pasamos el monto USD directo (formato "$X.XX USD") asi el simbolo $
              // del template queda como sufijo redundante pero correcto, en lugar de
              // recibir "Bs 68,20 $" que es ambiguo. El monto en Bs lo ve el cliente
              // en su extracto bancario y en el comprobante de Mercantil.
              const amountMsg = `$${Number(item.amount_usd).toFixed(2)} USD`;
              const concept = item.concept || "Servicio WUIPI";
              const reference = normalized.reference_number || "";

              if (item.customer_phone) {
                sendPaymentConfirmationWhatsApp({
                  phone: item.customer_phone,
                  customerName: item.customer_name,
                  reference,
                  amount: amountMsg,
                  concept,
                }).catch((err: unknown) => console.error("[Mercantil Alias] WA error:", err));
              }
              if (item.customer_email) {
                sendPaymentConfirmationEmail({
                  email: item.customer_email,
                  customerName: item.customer_name,
                  reference,
                  amount: amountMsg,
                  concept,
                }).catch((err: unknown) => console.error("[Mercantil Alias] Email error:", err));
              }
            }

            // CRITICAL: marcar processed=true en payment_webhook_logs INMEDIATAMENTE
            // tras markItemPaid. Mercantil envia el webhook 2-3 veces y la idempotencia
            // depende de este flag. Si esperamos al final del handler (post-sync),
            // los retries del webhook entran antes de que se marque processed y
            // reprocesan todo (causando "factura ya posted" del segundo intento).
            if (logId) {
              await supabase
                .from("payment_webhook_logs")
                .update({
                  invoice_number: normalized.invoice_number || null,
                  status: normalized.raw_status || null,
                  payment_method: normalized.payment_method || null,
                  reference_number: normalized.reference_number || null,
                  amount: normalized.amount || null,
                  processed: true,
                })
                .eq("id", logId);
            }

            // Sprint 4 — sync Odoo via waitUntil. NO bloquea el response del
            // webhook (Mercantil ve 200 inmediato, no reintenta por timeout) y
            // NO bloquea al cliente (polling /api/cobranzas/[token] ya ve paid).
            // Si el sync sincronico falla, el helper encola para que el cron
            // reintente con backoff.
            // Solo si fuimos los primeros (wasAlreadyPaid=false) — sino otro
            // webhook concurrente ya disparo el sync.
            if (!wasAlreadyPaid) {
            const { odooInvoiceIds, invoiceAmountsUsd } = extractInvoiceSyncFields(item.metadata);
            const itemForSync = item;
            waitUntil(
              triggerOdooSyncOrEnqueue({
                collectionItemId: itemForSync.id,
                paymentToken: itemForSync.payment_token,
                customerCedulaRif: itemForSync.customer_cedula_rif,
                customerEmail: itemForSync.customer_email,
                paymentMethod: "debito_inmediato",
                paymentReference: normalized.reference_number || "",
                amountUsd: Number(itemForSync.amount_usd),
                amountVes: normalized.amount ?? null,
                odooInvoiceIds,
                invoiceAmountsUsd,
              }).catch((err) => {
                console.error("[Mercantil Alias] Sync Odoo waitUntil fallo:", err);
              })
            );
            } // end if (!wasAlreadyPaid) — guarda contra sync duplicado de webhooks concurrentes
          } else {
            processingError = "No se encontro item para invoice " + normalized.invoice_number;
            console.warn("[Mercantil Alias] " + processingError);
          }
        } else if (normalized.status === "approved" && !normalized.invoice_number) {
          // Pago externo aprobado SIN factura asociada: cliente pagó directo
          // por Pago Móvil/Transferencia al banco sin pasar por nuestro portal.
          // No tenemos a qué item asociarlo. Lo marcamos como processed=true
          // con flag `external_unmatched` para que aparezca en el sub-panel
          // "Pagos externos sin matchear" y finanzas lo concilie manual en Odoo.
          // El cron C1a (polling Odoo) cerrará casos en kanban si correspondiera.
          processed = true;
          processingError = `external_unmatched: ${normalized.payment_method || "unknown"}`;
          console.log(
            "[Mercantil Alias] Pago externo sin invoice — ref=" + normalized.reference_number +
            " method=" + normalized.payment_method + " amount=" + normalized.amount + " → external_unmatched"
          );
        } else if (normalized.status !== "approved" && normalized.invoice_number) {
          // Banco rechazo el pago. Marcar el item como failed para que la UI
          // muestre el mensaje de error inmediato en vez de esperar 5 minutos
          // de polling sin novedad.
          let item = await getItemByMercantilInvoiceId(normalized.invoice_number);
          if (!item) {
            // Sanitizar (ver nota en el branch approved): evita inyeccion de
            // operadores PostgREST via el invoice_number del webhook.
            const safeInv = String(normalized.invoice_number).replace(/[,()]/g, "");
            const { data: items } = await supabase
              .from("collection_items")
              .select("*")
              .or(`invoice_number.eq.${safeInv},payment_token.eq.${safeInv}`)
              .in("status", ["pending", "sent", "viewed"])
              .limit(1);
            item = items && items[0] ? items[0] : null;
          }
          if (item && item.status !== "paid") {
            // Solo marcar failed si el item NO esta ya pagado. Mercantil a
            // veces manda webhooks fuera de orden — un decline tardio no
            // debe sobre-escribir un pago exitoso anterior.
            await supabase
              .from("collection_items")
              .update({
                status: "failed",
                payment_reference: normalized.reference_number || null,
              })
              .eq("id", item.id)
              .neq("status", "paid");
            console.log(
              "[Mercantil Alias] Item " + item.id + " marcado como failed (codigo=" +
              normalized.raw_status + " mensaje=" + (normalized.message || "") + ")"
            );
            // Log webhook rejected (error) — datos clave para forensics
            const errCat = classifyError("mercantil", normalized.error_code, normalized.message);
            logGatewayEvent({
              collectionItemId: item.id, paymentToken: item.payment_token,
              gateway: "mercantil", gatewayProduct: "web_button",
              eventType: "webhook_received", outcome: "error",
              response: {
                status: normalized.raw_status,
                errorCode: normalized.error_code || null,
                errorMessage: normalized.message || null,
              },
              responseCode: normalized.error_code || normalized.raw_status || null,
              responseMessage: normalized.message || null,
              errorCategory: errCat,
              ip,
              customerCedulaRif: item.customer_cedula_rif,
              customerName: item.customer_name,
              amountUsd: Number(item.amount_usd),
              amountVes: normalized.amount ?? null,
            }).catch(() => {});

            // Auto-ticket en kanban: el cliente intento pagar pero el banco
            // rechazo. Mapeo errorCategory -> failureType de createPaymentFailureCase.
            const failureType: "intra_bank_limit" | "insufficient_funds" | "invalid_credentials" | "gateway_error" =
              errCat === "intra_bank_limit" ? "intra_bank_limit" :
              errCat === "insufficient_funds" ? "insufficient_funds" :
              errCat === "invalid_credentials" ? "invalid_credentials" :
              "gateway_error";
            createPaymentFailureCase({
              collectionItemId: item.id,
              gateway: "mercantil",
              gatewayProduct: "web_button",
              failureType,
              errorCode: normalized.error_code || normalized.raw_status,
              errorMessage: normalized.message,
            }).catch(err =>
              console.error("[Mercantil Alias] createPaymentFailureCase fallo:", err)
            );
          } else if (item && item.status === "paid") {
            console.log(
              "[Mercantil Alias] Item " + item.id + " ya esta paid — ignorando decline tardio"
            );
          }
          processingError = "Status no aprobado: " + normalized.raw_status +
            (normalized.message ? " (" + normalized.message + ")" : "") +
            (normalized.error_code ? " code=" + normalized.error_code : "");
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
