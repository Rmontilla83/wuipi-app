// GET /api/cron/transfer-search-retry
//
// Reintenta la búsqueda en Mercantil de las transferencias que quedaron en
// "conciliating" (la búsqueda al momento de reportar dio "pending"). Hasta
// 2026-06-04 NO existía este cron: la búsqueda se hacía UNA sola vez y el item
// quedaba colgado indefinidamente, mientras la UI prometía falsamente que "un
// cron sigue verificando". Este endpoint hace real esa promesa.
//
// Por cada item conciliating reciente:
//   1. Recupera bank_code + amount del gateway log (lo que el cliente vio/transfirió).
//   2. Re-ejecuta searchTransfers multi-fecha contra Mercantil.
//   3. Si encuentra → markItemPaid + sync Odoo + log success.
//   4. Si no → lo deja en conciliating para el próximo ciclo.
//
// Solo reintenta items de los últimos RETRY_WINDOW_DAYS días. Los más viejos
// se asumen para conciliación manual (la transferencia probablemente tuvo
// monto/ref distintos, no es cuestión de lag).
//
// Auth: Bearer ${CRON_SECRET} (Vercel Cron).

export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { MercantilSDK, transferReferenceLast8 } from "@/lib/mercantil";
import { markItemPaid } from "@/lib/dal/collection-campaigns";
import { logGatewayEvent } from "@/lib/dal/payment-gateway-logs";

const WUIPI_ACCOUNT = "01050745651745103031";
const TRANSACTION_TYPE = 1;
const RETRY_WINDOW_DAYS = 5;   // no reintentar transferencias más viejas que esto
const BATCH = 20;              // máx items por corrida (cada uno ~3 llamadas a Mercantil)

interface ConciliatingItem {
  id: string;
  payment_token: string;
  payment_reference: string | null;
  customer_cedula_rif: string;
  customer_name: string;
  customer_email: string | null;
  amount_usd: number | null;
  amount_bss: number | null;
  bcv_rate: number | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.ODOO_SYNC_ENABLED === undefined) {
    // No bloqueante — solo informativo. La búsqueda Mercantil no depende de Odoo.
  }

  const sdk = new MercantilSDK();
  if (!sdk.isProductConfigured("transfer_search")) {
    return NextResponse.json({ skipped: true, reason: "transfer_search no configurado" });
  }

  const db = createAdminSupabase();
  const windowFrom = new Date(Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: items, error } = await db
    .from("collection_items")
    .select("id, payment_token, payment_reference, customer_cedula_rif, customer_name, customer_email, amount_usd, amount_bss, bcv_rate, created_at, metadata")
    .eq("status", "conciliating")
    .eq("payment_method", "transferencia")
    .gte("created_at", windowFrom)
    .order("created_at", { ascending: false })
    .limit(BATCH);

  if (error) {
    console.error("[cron/transfer-retry] query error:", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const summary = { revisados: 0, confirmados: 0, sin_match: 0, sin_datos: 0, errores: 0 };

  for (const item of (items || []) as ConciliatingItem[]) {
    summary.revisados++;
    try {
      const outcome = await retryOne(db, sdk, item);
      if (outcome === "confirmed") summary.confirmados++;
      else if (outcome === "no_match") summary.sin_match++;
      else summary.sin_datos++;
    } catch (e) {
      summary.errores++;
      console.error(`[cron/transfer-retry] item ${item.id} error:`, e);
    }
  }

  return NextResponse.json(summary);
}

type RetryOutcome = "confirmed" | "no_match" | "no_data";

async function retryOne(
  db: ReturnType<typeof createAdminSupabase>,
  sdk: MercantilSDK,
  item: ConciliatingItem,
): Promise<RetryOutcome> {
  // Recuperar bank_code + amount del último request_sent con bank_code presente.
  const { data: logs } = await db
    .from("payment_gateway_logs")
    .select("request_payload, created_at")
    .eq("collection_item_id", item.id)
    .eq("gateway_product", "transfer_search")
    .eq("event_type", "request_sent")
    .order("created_at", { ascending: false })
    .limit(5);

  let bankCode: string | null = null;
  let searchAmount: number | null = null;
  for (const l of logs || []) {
    const rp = (l.request_payload || {}) as Record<string, unknown>;
    if (!bankCode && rp.bank_code) bankCode = String(rp.bank_code);
    if (!searchAmount && typeof rp.amount === "number") searchAmount = rp.amount;
  }
  // Fallbacks
  if (!searchAmount && item.amount_bss) searchAmount = Number(item.amount_bss);
  const reference = item.payment_reference || "";

  if (!bankCode || !searchAmount || !reference || !item.customer_cedula_rif) {
    return "no_data";
  }

  // Multi-fecha: desde la fecha de reporte hacia atrás 3 días (cubre el lag
  // típico de que la trx aparezca consultable + reportes al día siguiente).
  const base = new Date(item.created_at);
  const dates: string[] = [];
  for (let d = 0; d < 4; d++) {
    const dt = new Date(base);
    dt.setUTCDate(dt.getUTCDate() - d);
    dates.push(dt.toISOString().split("T")[0]);
  }

  const expectedLast8 = transferReferenceLast8(reference);
  let hit = false;
  for (const trxDate of dates) {
    const results = await sdk.searchTransfers({
      account: WUIPI_ACCOUNT,
      issuerCustomerId: String(item.customer_cedula_rif),
      trxDate,
      issuerBankId: parseInt(bankCode, 10),
      transactionType: TRANSACTION_TYPE,
      paymentReference: reference,
      amount: searchAmount,
    });
    if (results.length > 0) {
      const match = results.find((t) => !t.paymentReference || t.paymentReference === expectedLast8);
      if (match) { hit = true; break; }
    }
  }

  if (!hit) {
    return "no_match";
  }

  // ── Confirmado: marcar paid + sync Odoo ──
  const paid = await markItemPaid(item.payment_token, {
    payment_method: "transferencia",
    payment_reference: reference,
    amount_bss: item.amount_bss ?? undefined,
    bcv_rate: item.bcv_rate ?? undefined,
  });

  logGatewayEvent({
    collectionItemId: item.id,
    paymentToken: item.payment_token,
    gateway: "transferencia",
    gatewayProduct: "transfer_search",
    eventType: "success",
    outcome: "success",
    response: { matched: true, via: "cron_retry" },
  }).catch(() => {});

  // Sync Odoo (inline — el cron puede esperar, no hay request del cliente que
  // bloquear). Solo si markItemPaid efectivamente cambió el estado (no si ya
  // estaba paid por otra vía en paralelo).
  if (!paid?.wasAlreadyPaid) {
    try {
      const { triggerOdooSyncOrEnqueue, extractInvoiceSyncFields } = await import("@/lib/integrations/odoo-sync-trigger");
      const { odooInvoiceIds, invoiceAmountsUsd } = extractInvoiceSyncFields(item.metadata);
      await triggerOdooSyncOrEnqueue({
        collectionItemId: item.id,
        paymentToken: item.payment_token,
        customerCedulaRif: item.customer_cedula_rif,
        customerEmail: item.customer_email,
        paymentMethod: "transferencia",
        paymentReference: reference,
        amountUsd: item.amount_usd != null ? Number(item.amount_usd) : null,
        amountVes: item.amount_bss != null ? Number(item.amount_bss) : null,
        odooInvoiceIds,
        invoiceAmountsUsd,
      });
    } catch (e) {
      console.error(`[cron/transfer-retry] sync Odoo fallo para ${item.id}:`, e);
    }
  }

  console.log(`[cron/transfer-retry] ✓ confirmado ${item.customer_name} ref=${reference}`);
  return "confirmed";
}
