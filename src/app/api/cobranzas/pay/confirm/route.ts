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

// Wuipi bank account at Mercantil (destination of all transfers to us).
// Full number with branch; Mercantil transfer-search expects only the account number.
const WUIPI_ACCOUNT = "01050287051287005713";

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
    //           amount_bss calculated during /api/cobranzas/pay, and
    //           transfer_search product configured with prod credentials.
    let autoVerified = false;
    let autoVerifyError: string | null = null;

    const sdk = new MercantilSDK();
    const canVerify =
      bankCode &&
      item.customer_cedula_rif &&
      item.amount_bss &&
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
          amount: Number(item.amount_bss),
        });

        // Match: Mercantil returned at least one transaction matching ref+amount.
        // Extra sanity: verify the reference matches (some banks return empty
        // reference_number field inconsistently).
        const hit = results.find(t => {
          const refMatches = !t.reference_number || t.reference_number === reference;
          const amtDiff = Math.abs(Number(t.amount) - Number(item.amount_bss));
          return refMatches && amtDiff < 0.01;
        });

        if (hit) {
          autoVerified = true;
          console.log(
            `[PayConfirm] auto-verified ref=${reference} item=${item.id} via Mercantil`
          );
        } else {
          console.log(
            `[PayConfirm] no match on Mercantil — ref=${reference} cedula=${cedulaDigits} bank=${bankCode} amount=${item.amount_bss} → conciliating`
          );
        }
      } catch (err) {
        autoVerifyError = (err as Error).message;
        console.warn(`[PayConfirm] transfer-search failed: ${autoVerifyError}`);
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

    // Notifications (fire-and-forget)
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
      auto_verified: autoVerified,
      message: autoVerified
        ? "¡Pago confirmado! Tu transferencia fue verificada con el banco."
        : "Transferencia reportada. Será verificada en las próximas horas.",
    });
  } catch (error) {
    return apiServerError(error);
  }
}
