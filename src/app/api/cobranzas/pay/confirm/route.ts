// POST /api/cobranzas/pay/confirm
// Client reports a transfer with (reference, bank). Server attempts automated
// verification via Mercantil transfer-search; on match → paid immediately.
// On no-match, falls back to "conciliating" for manual review.
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionConfirmTransferSchema } from "@/lib/validations/schemas";
import { getItemsByToken, updateItem } from "@/lib/dal/collection-campaigns";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { MercantilSDK } from "@/lib/mercantil";
import { fetchBCVRate, convertUsdToBs } from "@/lib/integrations/bcv";
import { logGatewayEvent, classifyError, maskAccountLast4 } from "@/lib/dal/payment-gateway-logs";
import { createPaymentFailureCase, closeOpenCasesForPaidItem } from "@/lib/cobranzas/payment-failure-case";

// Wuipi bank account at Mercantil (destination of all transfers to us).
// Full 20-digit number; Mercantil transfer-search expects the account number.
const WUIPI_ACCOUNT = "01050745651745103031";

// transactionType=1 covers both Débito Inmediato (most common) and regular
// interbank transfers in Mercantil's transfer-search taxonomy.
const TRANSACTION_TYPE_DEFAULT = 1;

// Deploy marker — si ves este string en runtime logs, este deploy SI tiene el fix duck-type
const PAY_CONFIRM_DEPLOY_MARKER = "PAY_CONFIRM_v2026_05_13_DUCKTYPE_2";

export async function POST(request: NextRequest) {
  try {
    console.log(`[PayConfirm] start | marker=${PAY_CONFIRM_DEPLOY_MARKER}`);
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`confirm:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = validate(collectionConfirmTransferSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { token, reference, bankCode, declaredAmountBss } = parsed.data;
    const item = await getItemsByToken(token);
    if (!item) return apiError("Enlace de pago no encontrado", 404);
    if (item.status === "paid") return apiError("Este cobro ya fue pagado", 400);
    if (item.status === "conciliating") return apiError("Ya se reportó un pago para este cobro", 400);
    if (!["pending", "sent", "viewed"].includes(item.status)) return apiError("Este cobro no puede recibir pagos", 400);

    // ── Attempt automated verification against Mercantil ────────────────
    // Requires: bankCode from client, customer_cedula_rif stored on item,
    //           amount in Bs (either persisted or computed now from BCV), and
    //           transfer_search product configured with prod credentials.
    let autoVerified = false;
    let autoVerifyError: string | null = null;
    // Flag "monto declarado != adeudado del item" — la trx existe pero por
    // un monto distinto (ej: cliente transfirió ayer con tasa BCV anterior).
    // NO marca paid, abre caso amount_mismatch en kanban y devuelve mensaje
    // claro al cliente para que se comunique con cobranzas.
    let amountMismatch = false;
    let mercantilFoundAmount: number | null = null;

    // Ensure amount_bss is populated. The transfer-flow UI never hits
    // /api/cobranzas/pay (that's only for debito_inmediato/stripe/paypal),
    // so amount_bss is typically null when we arrive here. Compute + persist
    // from the BCV rate so downstream Mercantil search has a value to compare.
    let amountBss = item.amount_bss ? Number(item.amount_bss) : null;
    if (!amountBss) {
      try {
        const bcv = await fetchBCVRate();
        amountBss = convertUsdToBs(Number(item.amount_usd), bcv.usd_to_bs);
        await updateItem(item.id, {
          amount_bss: amountBss,
          bcv_rate: bcv.usd_to_bs,
        } as Record<string, unknown>);
      } catch (err) {
        console.warn("[PayConfirm] BCV fetch failed:", (err as Error).message);
      }
    }

    const sdk = new MercantilSDK();
    const canVerify =
      bankCode &&
      item.customer_cedula_rif &&
      amountBss &&
      sdk.isProductConfigured("transfer_search");

    if (canVerify) {
      const t0 = Date.now();
      // Monto que se va a usar en la búsqueda Mercantil: si el cliente
      // declaró un monto explícito (el que realmente transfirió, posiblemente
      // distinto al adeudado actual por cambio de tasa BCV), usamos ese. Si
      // no, fallback al amount_bss del item (comportamiento previo).
      const searchAmount = typeof declaredAmountBss === "number" && declaredAmountBss > 0
        ? declaredAmountBss
        : amountBss!;
      // Tolerancia: 1 centavo (los montos vienen con 2 decimales). Si el
      // cliente declara explícitamente un monto que difiere del item por
      // más de 1 centavo, lo tratamos como "intento distinto".
      const isDifferentAmount =
        typeof declaredAmountBss === "number" &&
        Math.abs(declaredAmountBss - amountBss!) >= 0.01;

      logGatewayEvent({
        collectionItemId: item.id, paymentToken: item.payment_token,
        gateway: "transferencia", gatewayProduct: "transfer_search",
        eventType: "request_sent",
        request: {
          amount: searchAmount,
          item_amount_bss: amountBss,
          declared_amount_bss: declaredAmountBss ?? null,
          amount_intent: isDifferentAmount ? "different" : "exact",
          reference_number: reference,
          account_last4: maskAccountLast4(WUIPI_ACCOUNT),
          bank_code: bankCode,
          date: new Date().toISOString().split("T")[0],
        },
        amountVes: searchAmount, customerCedulaRif: item.customer_cedula_rif,
      }).catch(() => {});
      try {
        // Pass cedula completa al SDK. normalizeIssuerCustomerId() preserva la
        // letra (V/J/E/G/P) — quitarla aquí rompía clientes jurídicos porque
        // el helper caía al default 'V'. Mercantil exige formato exacto V17123456.
        const issuerCustomerId = String(item.customer_cedula_rif ?? "");

        // Búsqueda multi-fecha: clientes a veces reportan la transferencia al
        // día siguiente (especialmente nocturnas). Probamos hoy → ayer → 2 días
        // atrás. Para más antiguas el admin promueve manual via promote-paid.
        const dates = [0, 1, 2].map((daysAgo) => {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - daysAgo);
          return d.toISOString().split("T")[0];
        });

        console.log(`[PayConfirm] starting multi-date loop dates=[${dates.join(",")}] amount=${searchAmount} ref=${reference} cedula=${issuerCustomerId}`);
        let results: Awaited<ReturnType<typeof sdk.searchTransfers>> = [];
        let matchedDate: string | null = null;
        for (const trxDate of dates) {
          console.log(`[PayConfirm] trying trxDate=${trxDate}`);
          const r = await sdk.searchTransfers({
            account: WUIPI_ACCOUNT,
            issuerCustomerId,
            trxDate,
            issuerBankId: parseInt(bankCode!, 10),
            transactionType: TRANSACTION_TYPE_DEFAULT,
            paymentReference: reference,
            amount: searchAmount,
          });
          console.log(`[PayConfirm] trxDate=${trxDate} → results.length=${r.length}`);
          if (r.length > 0) {
            results = r;
            matchedDate = trxDate;
            break;
          }
        }

        // Match: Mercantil returned at least one transaction matching ref+amount.
        // Extra sanity: verify the reference matches (some banks return empty
        // reference_number field inconsistently). Comparamos contra el monto
        // que buscamos (searchAmount), no contra amountBss del item.
        const hit = results.find(t => {
          const refMatches = !t.reference_number || t.reference_number === reference;
          const amtDiff = Math.abs(Number(t.amount) - searchAmount);
          return refMatches && amtDiff < 0.01;
        });
        if (hit && matchedDate) {
          console.log(`[PayConfirm] match en trxDate=${matchedDate}`);
        }

        if (hit) {
          // Match en Mercantil. Si el monto declarado difería del adeudado,
          // NO marcamos paid — la trx existe pero por un monto distinto.
          // Casos típicos: cliente transfirió con tasa BCV antigua (deuda
          // recalculó), o pagó parcial/excedido por error.
          if (isDifferentAmount) {
            amountMismatch = true;
            mercantilFoundAmount = Number(hit.amount);
            console.log(
              `[PayConfirm] AMOUNT MISMATCH: cliente declaró ${searchAmount} Bs, ` +
              `Mercantil confirmó ${hit.amount} Bs, item esperaba ${amountBss} Bs — NO marca paid`
            );
            logGatewayEvent({
              collectionItemId: item.id, paymentToken: item.payment_token,
              gateway: "transferencia", gatewayProduct: "transfer_search",
              eventType: "response_received", outcome: "pending",
              response: {
                matched: true,
                amount_mismatch: true,
                mercantil_amount: mercantilFoundAmount,
                item_amount: amountBss,
                declared_amount: declaredAmountBss,
              },
              errorCategory: "amount_mismatch",
              durationMs: Date.now() - t0,
            }).catch(() => {});
          } else {
            autoVerified = true;
            console.log(
              `[PayConfirm] auto-verified ref=${reference} item=${item.id} via Mercantil`
            );
            logGatewayEvent({
              collectionItemId: item.id, paymentToken: item.payment_token,
              gateway: "transferencia", gatewayProduct: "transfer_search",
              eventType: "response_received", outcome: "success",
              response: { matched: true },
              durationMs: Date.now() - t0,
            }).catch(() => {});
          }
        } else {
          console.log(
            `[PayConfirm] no match on Mercantil — ref=${reference} cedula=${issuerCustomerId} bank=${bankCode} amount=${amountBss} dates=${dates.join(",")} results=${results.length} → conciliating`
          );
          logGatewayEvent({
            collectionItemId: item.id, paymentToken: item.payment_token,
            gateway: "transferencia", gatewayProduct: "transfer_search",
            eventType: "response_received", outcome: "pending",
            response: { matched: false },
            durationMs: Date.now() - t0,
          }).catch(() => {});
        }
      } catch (err) {
        const e = err as { message?: string; status?: number; details?: unknown };
        autoVerifyError = e.message || "unknown";
        // Log full Mercantil error details — includes the x-global-transaction-id
        // that their support team needs to investigate (code=99999 is generic).
        console.warn(
          `[PayConfirm] transfer-search failed: status=${e.status || "?"} ` +
          `message=${autoVerifyError} details=${JSON.stringify(e.details || {})}`
        );
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "transferencia", gatewayProduct: "transfer_search",
          eventType: "error", outcome: "error",
          responseCode: e.status ? String(e.status) : null,
          responseMessage: autoVerifyError,
          errorCategory: classifyError("mercantil", e.status ? String(e.status) : null, autoVerifyError),
          durationMs: Date.now() - t0,
        }).catch(() => {});
        // Fall through to conciliating — don't block the client on Mercantil hiccups.
      }
    }

    const newStatus = autoVerified ? "paid" : "conciliating";
    const update: Record<string, unknown> = {
      status: newStatus,
      payment_method: "transferencia",
      payment_reference: reference,
    };
    if (autoVerified) {
      update.paid_at = new Date().toISOString();
    }
    if (amountMismatch) {
      // Persistimos los detalles del mismatch en metadata para que el
      // sub-panel admin / WA outbox tengan el contexto al revisar el caso.
      update.metadata = {
        ...((item.metadata as Record<string, unknown> | null) || {}),
        amount_mismatch: {
          detected_at: new Date().toISOString(),
          item_amount_bss: amountBss,
          declared_amount_bss: declaredAmountBss,
          mercantil_found_amount: mercantilFoundAmount,
          message: "Cliente reportó monto distinto al adeudado — verificar manualmente",
        },
      };
    }
    await updateItem(item.id, update);

    // Caso especial: la trx existe en Mercantil pero por un monto distinto al
    // adeudado. Abrimos caso en kanban con failureType=amount_mismatch para
    // que finanzas contacte al cliente. NO marcamos paid ni enviamos confirm.
    if (amountMismatch) {
      createPaymentFailureCase({
        collectionItemId: item.id,
        gateway: "transferencia",
        gatewayProduct: "transfer_search",
        failureType: "amount_mismatch",
        errorCode: "amount_mismatch",
        errorMessage: `Cliente declaró Bs ${declaredAmountBss?.toFixed(2)}, Mercantil confirmó Bs ${mercantilFoundAmount?.toFixed(2)}, adeudado Bs ${amountBss?.toFixed(2)}`,
      }).catch((err) =>
        console.error("[PayConfirm] createPaymentFailureCase amount_mismatch fallo:", err)
      );

      return apiSuccess({
        status: "conciliating",
        auto_verified: false,
        amount_mismatch: true,
        mercantil_amount: mercantilFoundAmount,
        expected_amount_bss: amountBss,
        declared_amount_bss: declaredAmountBss,
        message:
          "Detectamos tu transferencia en el banco, pero el monto difiere del adeudado. " +
          "Comunícate con cobranzas por WhatsApp para regularizar la diferencia.",
      });
    }

    // Only send "pago recibido" confirmations when the payment is ACTUALLY
    // paid (auto-verified against Mercantil). For 'conciliating' we must NOT
    // imply the payment is received — the client already sees "en proceso
    // de verificación" on the portal, and a false confirmation by WA/email
    // would be misleading. When manual admin promotion to 'paid' is added,
    // notifications fire from that path.
    if (!autoVerified) {
      return apiSuccess({
        status: newStatus,
        auto_verified: false,
        message: "Transferencia reportada. Será verificada en las próximas horas.",
      });
    }

    // Cerrar caso(s) abierto(s) en kanban si los hay (cliente habia tenido
    // fallo previo y ahora pago via transferencia auto-verificada)
    closeOpenCasesForPaidItem(item.id).catch(err =>
      console.error("[PayConfirm] closeOpenCasesForPaidItem fallo:", err)
    );

    // Sprint 4 — sync Odoo via waitUntil (no bloquea respuesta).
    try {
      const { waitUntil } = await import("@vercel/functions");
      const { triggerOdooSyncOrEnqueue } = await import("@/lib/integrations/odoo-sync-trigger");
      const itemMeta = (item.metadata as Record<string, unknown> | null) || null;
      const odooInvoiceIds = Array.isArray(itemMeta?.odoo_invoice_ids)
        ? (itemMeta!.odoo_invoice_ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0)
        : null;
      waitUntil(
        triggerOdooSyncOrEnqueue({
          collectionItemId: item.id,
          paymentToken: item.payment_token,
          customerCedulaRif: item.customer_cedula_rif,
          customerEmail: item.customer_email,
          paymentMethod: "transferencia",
          paymentReference: reference,
          amountUsd: Number(item.amount_usd),
          amountVes: typeof item.amount_bss === "number" ? item.amount_bss : null,
          odooInvoiceIds,
        }).catch((err) => console.error("[PayConfirm] Sync Odoo fallo:", err))
      );
    } catch (err) {
      console.error("[PayConfirm] Sync Odoo setup fallo:", err);
    }

    // Notifications (fire-and-forget) — only on real confirmation
    const amount = `$${Number(item.amount_usd).toFixed(2)} USD`;
    const concept = item.concept || "Servicio WUIPI";

    if (item.customer_phone) {
      sendPaymentConfirmationWhatsApp({
        phone: item.customer_phone,
        customerName: item.customer_name,
        reference,
        amount,
        concept,
      }).catch((err) => console.error("[PayConfirm] WA confirmation error:", err));
    }

    if (item.customer_email) {
      sendPaymentConfirmationEmail({
        email: item.customer_email,
        customerName: item.customer_name,
        reference,
        amount,
        concept,
      }).catch((err) => console.error("[PayConfirm] Email confirmation error:", err));
    }

    return apiSuccess({
      status: newStatus,
      auto_verified: true,
      message: "¡Pago confirmado! Tu transferencia fue verificada con el banco.",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
