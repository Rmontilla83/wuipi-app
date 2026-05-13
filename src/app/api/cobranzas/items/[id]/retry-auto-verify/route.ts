// POST /api/cobranzas/items/[id]/retry-auto-verify
//
// Reintenta el auto-verify de Mercantil transfer-search contra un item que
// quedó en `conciliating` porque el SDK estaba roto (9999/99999) en el momento
// que el cliente declaró la transferencia.
//
// Caso de uso: tras el fix Mercantil 2026-05-13 (subnodo mobile + formato
// V17123456 + browserAgent Chrome) hay items históricos en `conciliating` que
// pueden ahora auto-verificarse sin promoción manual.
//
// Si match → marca paid + dispara sync Odoo + notif WA/email. Si no → no toca
// el item, devuelve diagnóstico.
//
// Requiere cobranzas:approve (super_admin/admin/finanzas).
//
// Body opcional:
//   {
//     bankCode?: string,        // default: leído de metadata.bank_code
//     reference?: string,       // default: item.payment_reference
//     amountBss?: number,       // default: item.amount_bss
//     trxDateOverride?: string  // YYYY-MM-DD — útil para items muy viejos
//   }

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { markItemPaid } from "@/lib/dal/collection-campaigns";
import { MercantilSDK } from "@/lib/mercantil";
import { triggerOdooSyncOrEnqueue } from "@/lib/integrations/odoo-sync-trigger";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { logGatewayEvent, classifyError, maskAccountLast4 } from "@/lib/dal/payment-gateway-logs";
import { closeOpenCasesForPaidItem } from "@/lib/cobranzas/payment-failure-case";

const WUIPI_ACCOUNT = "01050745651745103031";
const TRANSACTION_TYPE_DEFAULT = 1;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await requirePermission("cobranzas", "approve");
  if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const itemId = params.id;
  if (!itemId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  let body: {
    bankCode?: string;
    reference?: string;
    amountBss?: number;
    trxDateOverride?: string;
  };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const sb = createAdminSupabase();
  const { data: item, error: readErr } = await sb
    .from("collection_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readErr || !item) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  }

  if (item.status === "paid") {
    return NextResponse.json({
      error: "Item ya esta paid", current_status: item.status,
    }, { status: 409 });
  }
  if (!["conciliating", "pending", "sent", "viewed"].includes(item.status)) {
    return NextResponse.json({
      error: `Item en state="${item.status}" no apto para auto-verify`,
    }, { status: 409 });
  }

  const reference = body.reference || item.payment_reference;
  if (!reference) {
    return NextResponse.json({ error: "Falta reference (no en body ni en item)" }, { status: 400 });
  }

  const amountBss = typeof body.amountBss === "number"
    ? body.amountBss
    : (typeof item.amount_bss === "number" ? item.amount_bss : Number(item.amount_bss || 0));
  if (!amountBss || amountBss <= 0) {
    return NextResponse.json({ error: "Falta amount_bss en item" }, { status: 400 });
  }

  const metadataObj = (item.metadata as Record<string, unknown> | null) || null;
  const bankCode = body.bankCode
    || (metadataObj?.bank_code as string | undefined)
    || (metadataObj?.bankCode as string | undefined);
  if (!bankCode) {
    return NextResponse.json({
      error: "bankCode requerido (no en body ni en metadata)",
    }, { status: 400 });
  }

  if (!item.customer_cedula_rif) {
    return NextResponse.json({ error: "Item sin customer_cedula_rif" }, { status: 400 });
  }

  const sdk = new MercantilSDK();
  if (!sdk.isProductConfigured("transfer_search")) {
    return NextResponse.json({
      error: "Producto transfer_search no configurado",
    }, { status: 500 });
  }

  const issuerCustomerId = String(item.customer_cedula_rif);

  // Búsqueda multi-fecha: si hay override usamos ese día puntual, si no
  // probamos hoy → ayer → 2 días atrás (igual que pay/confirm).
  const dates = body.trxDateOverride
    ? [body.trxDateOverride]
    : [0, 1, 2].map((daysAgo) => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - daysAgo);
        return d.toISOString().split("T")[0];
      });

  const t0 = Date.now();
  logGatewayEvent({
    collectionItemId: item.id, paymentToken: item.payment_token,
    gateway: "transferencia", gatewayProduct: "transfer_search",
    eventType: "request_sent",
    request: {
      amount: amountBss,
      reference_number: reference,
      account_last4: maskAccountLast4(WUIPI_ACCOUNT),
      bank_code: bankCode,
      dates,
      retry_attempt: true,
      caller_id: caller.id,
    },
    amountVes: amountBss, customerCedulaRif: item.customer_cedula_rif,
  }).catch(() => {});

  let results: Awaited<ReturnType<typeof sdk.searchTransfers>> = [];
  let matchedDate: string | null = null;
  let lastError: { message: string; status?: number; details?: unknown } | null = null;

  for (const trxDate of dates) {
    try {
      const r = await sdk.searchTransfers({
        account: WUIPI_ACCOUNT,
        issuerCustomerId,
        trxDate,
        issuerBankId: parseInt(bankCode, 10),
        transactionType: TRANSACTION_TYPE_DEFAULT,
        paymentReference: reference,
        amount: amountBss,
      });
      if (r.length > 0) {
        results = r;
        matchedDate = trxDate;
        break;
      }
    } catch (err) {
      const e = err as { message?: string; status?: number; details?: unknown };
      lastError = { message: e.message || "unknown", status: e.status, details: e.details };
      // continúa probando otras fechas — un error en una no debería bloquear las demás
    }
  }

  if (lastError && results.length === 0) {
    logGatewayEvent({
      collectionItemId: item.id, paymentToken: item.payment_token,
      gateway: "transferencia", gatewayProduct: "transfer_search",
      eventType: "error", outcome: "error",
      responseCode: lastError.status ? String(lastError.status) : null,
      responseMessage: lastError.message,
      errorCategory: classifyError("mercantil", lastError.status ? String(lastError.status) : null, lastError.message),
      durationMs: Date.now() - t0,
    }).catch(() => {});
    return NextResponse.json({
      ok: false,
      matched: false,
      error: "Mercantil API error en todas las fechas",
      mercantil_error: lastError,
      tried_dates: dates,
    }, { status: 502 });
  }

  const hit = results.find(t => {
    const refMatches = !t.reference_number || t.reference_number === reference;
    const amtDiff = Math.abs(Number(t.amount) - amountBss);
    return refMatches && amtDiff < 0.01;
  });

  if (!hit) {
    logGatewayEvent({
      collectionItemId: item.id, paymentToken: item.payment_token,
      gateway: "transferencia", gatewayProduct: "transfer_search",
      eventType: "response_received", outcome: "pending",
      response: { matched: false, results_count: results.length },
      durationMs: Date.now() - t0,
    }).catch(() => {});
    return NextResponse.json({
      ok: true,
      matched: false,
      message: "No match en Mercantil. Item sigue en conciliating.",
      tried_dates: dates,
      results_returned: results.length,
    });
  }

  logGatewayEvent({
    collectionItemId: item.id, paymentToken: item.payment_token,
    gateway: "transferencia", gatewayProduct: "transfer_search",
    eventType: "response_received", outcome: "success",
    response: { matched: true, trx_date: matchedDate },
    durationMs: Date.now() - t0,
  }).catch(() => {});

  // ── Match → marcar paid + side effects ───────────────────────────────────
  try {
    await markItemPaid(item.payment_token, {
      payment_method: "transferencia",
      payment_reference: reference,
      amount_bss: amountBss,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      matched: true,
      error: `Match OK pero fallo markItemPaid: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }

  // Audit en metadata
  try {
    const mergedMetadata = {
      ...(metadataObj || {}),
      retry_auto_verify: {
        retried_by_user_id: caller.id,
        retried_by_email: caller.email,
        retried_at: new Date().toISOString(),
        matched_date: matchedDate,
        previous_status: item.status,
      },
    };
    await sb.from("collection_items").update({ metadata: mergedMetadata }).eq("id", itemId);
  } catch (err) {
    console.error("[RetryAutoVerify] Audit metadata fallo:", err);
  }

  closeOpenCasesForPaidItem(item.id).catch(err =>
    console.error("[RetryAutoVerify] closeOpenCasesForPaidItem fallo:", err)
  );

  // Sync Odoo
  try {
    const odooInvoiceIds = Array.isArray(metadataObj?.odoo_invoice_ids)
      ? (metadataObj!.odoo_invoice_ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0)
      : null;
    await triggerOdooSyncOrEnqueue({
      collectionItemId: item.id,
      paymentToken: item.payment_token,
      customerCedulaRif: item.customer_cedula_rif,
      customerEmail: item.customer_email,
      paymentMethod: "transferencia",
      paymentReference: reference,
      amountUsd: Number(item.amount_usd),
      amountVes: amountBss,
      odooInvoiceIds,
    });
  } catch (err) {
    console.error("[RetryAutoVerify] Sync Odoo fallo (no bloqueante):", err);
  }

  // Notificaciones
  const amountMsg = `$${Number(item.amount_usd).toFixed(2)} USD`;
  const concept = item.concept || "Servicio WUIPI";
  if (item.customer_phone) {
    sendPaymentConfirmationWhatsApp({
      phone: item.customer_phone, customerName: item.customer_name,
      reference, amount: amountMsg, concept,
    }).catch((err: unknown) => console.error("[RetryAutoVerify] WA error:", err));
  }
  if (item.customer_email) {
    sendPaymentConfirmationEmail({
      email: item.customer_email, customerName: item.customer_name,
      reference, amount: amountMsg, concept,
    }).catch((err: unknown) => console.error("[RetryAutoVerify] Email error:", err));
  }

  return NextResponse.json({
    ok: true,
    matched: true,
    status: "paid",
    matched_date: matchedDate,
    payment_method: "transferencia",
    payment_reference: reference,
    previous_status: item.status,
  });
}
