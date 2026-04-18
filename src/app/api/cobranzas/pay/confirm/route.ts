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

// Wuipi bank account at Mercantil (destination of all transfers to us).
// Full 20-digit number; Mercantil transfer-search expects the account number.
const WUIPI_ACCOUNT = "01050745651745103031";

// transactionType=1 covers both Débito Inmediato (most common) and regular
// interbank transfers in Mercantil's transfer-search taxonomy.
const TRANSACTION_TYPE_DEFAULT = 1;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`confirm:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = validate(collectionConfirmTransferSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const { token, reference, bankCode } = parsed.data;
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
      try {
        // Strip any prefix from the cedula (V/J/E/G) — Mercantil expects digits only.
        const cedulaDigits = String(item.customer_cedula_rif).replace(/^[VJEGP]-?/i, "").replace(/\D/g, "");

        // Transfers land same-day in Venezuela for Débito Inmediato; search today.
        const today = new Date().toISOString().split("T")[0];

        const results = await sdk.searchTransfers({
          account: WUIPI_ACCOUNT,
          issuerCustomerId: cedulaDigits,
          trxDate: today,
          issuerBankId: parseInt(bankCode!, 10),
          transactionType: TRANSACTION_TYPE_DEFAULT,
          paymentReference: reference,
          amount: amountBss!,
        });

        // Match: Mercantil returned at least one transaction matching ref+amount.
        // Extra sanity: verify the reference matches (some banks return empty
        // reference_number field inconsistently).
        const hit = results.find(t => {
          const refMatches = !t.reference_number || t.reference_number === reference;
          const amtDiff = Math.abs(Number(t.amount) - amountBss!);
          return refMatches && amtDiff < 0.01;
        });

        if (hit) {
          autoVerified = true;
          console.log(
            `[PayConfirm] auto-verified ref=${reference} item=${item.id} via Mercantil`
          );
        } else {
          console.log(
            `[PayConfirm] no match on Mercantil — ref=${reference} cedula=${cedulaDigits} bank=${bankCode} amount=${amountBss} results=${results.length} → conciliating`
          );
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
    await updateItem(item.id, update);

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
