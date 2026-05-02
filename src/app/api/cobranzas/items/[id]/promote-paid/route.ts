// POST /api/cobranzas/items/[id]/promote-paid
//
// Marca un item de cobranza como paid manualmente (admin verifica que el
// pago llego al banco por fuera del sistema). Dispara sync Odoo + envia
// notificacion al cliente.
//
// Caso de uso principal: TRANSFERENCIAS que el cliente reporto pero
// Mercantil transfer-search no pudo auto-verificar (esta bloqueado en prod
// con code=99999). Admin las verifica manualmente en el extracto bancario
// y promueve a paid desde aqui.
//
// Requiere: super_admin o admin/finanzas con permiso cobranzas:approve
//
// Body: {
//   payment_method: "transferencia" | "debito_inmediato",
//   payment_reference: string,         // referencia bancaria
//   amount_bss?: number,               // monto en VES (default: usa amount_bss del item)
//   notes?: string                     // notas opcionales para auditoria
// }

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { markItemPaid } from "@/lib/dal/collection-campaigns";
import { triggerOdooSyncOrEnqueue } from "@/lib/integrations/odoo-sync-trigger";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await requirePermission("cobranzas", "approve");
  if (!caller) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const itemId = params.id;
  if (!itemId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  let body: {
    payment_method?: string;
    payment_reference?: string;
    amount_bss?: number;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const validMethods = ["transferencia", "debito_inmediato", "c2p"];
  if (!body.payment_method || !validMethods.includes(body.payment_method)) {
    return NextResponse.json({
      error: `payment_method requerido. Validos: ${validMethods.join(", ")}`,
    }, { status: 400 });
  }
  if (!body.payment_reference || typeof body.payment_reference !== "string") {
    return NextResponse.json({ error: "payment_reference requerido" }, { status: 400 });
  }

  const sb = createAdminSupabase();

  // Lee item actual
  const { data: item, error: readErr } = await sb
    .from("collection_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (readErr || !item) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
  }

  // Idempotencia
  if (item.status === "paid") {
    return NextResponse.json({
      error: "Item ya esta paid",
      current_status: item.status,
      previous_payment_method: item.payment_method,
      previous_payment_reference: item.payment_reference,
    }, { status: 409 });
  }
  // Solo permitir desde estados normales (no failed/cancelled)
  const allowedFromStates = ["pending", "sent", "viewed", "conciliating"];
  if (!allowedFromStates.includes(item.status)) {
    return NextResponse.json({
      error: `Item en state="${item.status}" no se puede promover. Validos: ${allowedFromStates.join(", ")}`,
    }, { status: 409 });
  }

  // Marca como paid
  try {
    await markItemPaid(item.payment_token, {
      payment_method: body.payment_method as "transferencia" | "debito_inmediato" | "c2p",
      payment_reference: body.payment_reference,
      amount_bss: typeof body.amount_bss === "number" ? body.amount_bss : (item.amount_bss || undefined),
    });
  } catch (err) {
    return NextResponse.json({
      error: `Fallo al marcar paid: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }

  // Audit en metadata para trazabilidad de quien promovio
  try {
    const mergedMetadata = {
      ...(item.metadata || {}),
      promoted_paid: {
        promoted_by_user_id: caller.id,
        promoted_by_email: caller.email,
        promoted_at: new Date().toISOString(),
        previous_status: item.status,
        notes: body.notes || null,
      },
    };
    await sb.from("collection_items").update({ metadata: mergedMetadata }).eq("id", itemId);
  } catch (err) {
    console.error("[PromotePaid] Audit metadata fallo:", err);
  }

  // Dispara sync Odoo (best-effort, fallback a cola)
  try {
    await triggerOdooSyncOrEnqueue({
      collectionItemId: item.id,
      paymentToken: item.payment_token,
      customerCedulaRif: item.customer_cedula_rif,
      customerEmail: item.customer_email,
      paymentMethod: body.payment_method,
      paymentReference: body.payment_reference,
      amountUsd: Number(item.amount_usd),
      amountVes: typeof body.amount_bss === "number"
        ? body.amount_bss
        : (typeof item.amount_bss === "number" ? item.amount_bss : null),
    });
  } catch (err) {
    console.error("[PromotePaid] Sync Odoo fallo (no bloqueante):", err);
  }

  // Notifica al cliente (fire-and-forget)
  const amountMsg = typeof body.amount_bss === "number"
    ? `Bs ${body.amount_bss.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
    : `$${Number(item.amount_usd).toFixed(2)} USD`;
  const concept = item.concept || "Servicio WUIPI";

  if (item.customer_phone) {
    sendPaymentConfirmationWhatsApp({
      phone: item.customer_phone,
      customerName: item.customer_name,
      reference: body.payment_reference,
      amount: amountMsg,
      concept,
    }).catch((err: unknown) => console.error("[PromotePaid] WA error:", err));
  }
  if (item.customer_email) {
    sendPaymentConfirmationEmail({
      email: item.customer_email,
      customerName: item.customer_name,
      reference: body.payment_reference,
      amount: amountMsg,
      concept,
    }).catch((err: unknown) => console.error("[PromotePaid] Email error:", err));
  }

  return NextResponse.json({
    ok: true,
    item_id: itemId,
    status: "paid",
    payment_method: body.payment_method,
    payment_reference: body.payment_reference,
    promoted_from_status: item.status,
  });
}
