// POST /api/cobranzas/items/[id]/sync-odoo
//
// Re-dispara el sync Odoo para un item que ya está marcado paid en Supabase
// pero por alguna razón no se sincronizó (whitelist activa que lo skipeó,
// trigger que falló silente, etc.).
//
// Casos típicos:
//  - Item paid de cliente que NO estaba en ODOO_SYNC_PARTNER_WHITELIST
//  - Sync queue marcada manual_review que querés re-intentar
//  - Pago que llegó por canal externo y se promovió manual via promote-paid
//    pero sin disparar sync automático
//
// Permisos: cobranzas:approve (super_admin/admin/finanzas)
//
// Body: { force?: boolean } — si force=true ignora si ya está en odoo_sync_queue

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { triggerOdooSyncOrEnqueue, extractInvoiceSyncFields } from "@/lib/integrations/odoo-sync-trigger";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await requirePermission("cobranzas", "approve");
  if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const itemId = params.id;
  if (!itemId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  let body: { force?: boolean };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const sb = createAdminSupabase();

  // 1. Leer item
  const { data: item, error: readErr } = await sb
    .from("collection_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readErr || !item) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  }

  if (item.status !== "paid") {
    return NextResponse.json({
      error: `Item en state="${item.status}". Solo se puede re-sync de items paid.`,
    }, { status: 409 });
  }

  if (!item.payment_method) {
    return NextResponse.json({ error: "Item sin payment_method" }, { status: 400 });
  }

  // 2. Verificar si ya está en odoo_sync_queue (a menos que force=true)
  if (!body.force) {
    const { data: existingQueue } = await sb
      .from("odoo_sync_queue")
      .select("id, status, post_invoice_done, register_payment_done, last_error")
      .eq("collection_item_id", itemId)
      .maybeSingle();
    if (existingQueue && existingQueue.status !== "done" && existingQueue.status !== "manual_review") {
      return NextResponse.json({
        error: "Ya hay un row activo en odoo_sync_queue. Usa force=true para encolar uno nuevo.",
        existing: existingQueue,
      }, { status: 409 });
    }
  }

  // 3. Extraer odoo_invoice_ids + odoo_invoice_amounts_usd de metadata
  const itemMeta = (item.metadata as Record<string, unknown> | null) || null;
  const { odooInvoiceIds, invoiceAmountsUsd } = extractInvoiceSyncFields(itemMeta);

  // 4. Disparar el trigger (sync sincrónico o encolar si falla)
  const t0 = Date.now();
  try {
    await triggerOdooSyncOrEnqueue({
      collectionItemId: item.id,
      paymentToken: item.payment_token,
      customerCedulaRif: item.customer_cedula_rif,
      customerEmail: item.customer_email,
      paymentMethod: item.payment_method,
      paymentReference: item.payment_reference,
      amountUsd: Number(item.amount_usd),
      amountVes: typeof item.amount_bss === "number" ? item.amount_bss : Number(item.amount_bss) || null,
      paymentDate: item.paid_at || undefined,
      odooInvoiceIds,
      invoiceAmountsUsd,
    });

    // Audit en metadata para trazabilidad
    try {
      const mergedMetadata = {
        ...(itemMeta || {}),
        sync_odoo_manual: {
          triggered_by_user_id: caller.id,
          triggered_by_email: caller.email,
          triggered_at: new Date().toISOString(),
          duration_ms: Date.now() - t0,
        },
      };
      await sb.from("collection_items").update({ metadata: mergedMetadata }).eq("id", itemId);
    } catch (err) {
      console.error("[SyncOdoo Manual] Audit metadata fallo:", err);
    }

    // Verificar estado tras el trigger (puede haber quedado sync-OK o encolado)
    const { data: queueRow } = await sb
      .from("odoo_sync_queue")
      .select("id, status, post_invoice_done, register_payment_done, last_error, updated_at")
      .eq("collection_item_id", itemId)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      item_id: itemId,
      duration_ms: Date.now() - t0,
      queue_state: queueRow || null,
      message: queueRow
        ? `Sync iniciado. Queue status: ${queueRow.status}`
        : "Sync sincronico completado (o skip por whitelist/kill-switch). Sin row en queue.",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `Trigger Odoo fallo: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
