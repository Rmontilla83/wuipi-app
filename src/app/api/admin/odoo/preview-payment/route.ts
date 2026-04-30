// POST /api/admin/odoo/preview-payment
// Sprint 1 dry-run: preview de registrar pago en Odoo (crear account.payment +
// reconciliar con factura). NO toca Odoo.
//
// Body: {
//   invoice_id: number,
//   payment_method: "debito_inmediato" | ...,
//   payment_reference: string,
//   payment_token: string,
//   payment_date?: string  // YYYY-MM-DD, default hoy
// }
//
// Requiere: super_admin + whitelist por partner_id.

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { previewRegisterPayment, getInvoiceById } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const caller = await requirePermission("erp", "update");
  if (!caller || caller.role !== "super_admin") {
    return NextResponse.json({ error: "Solo super_admin puede previewear pagos" }, { status: 403 });
  }

  let body: {
    invoice_id?: number;
    payment_method?: string;
    payment_reference?: string;
    payment_token?: string;
    payment_date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const invoiceId = Number(body.invoice_id);
  if (!invoiceId || !Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "invoice_id requerido" }, { status: 400 });
  }
  if (!body.payment_method || !body.payment_reference || !body.payment_token) {
    return NextResponse.json({
      error: "payment_method, payment_reference y payment_token son requeridos"
    }, { status: 400 });
  }

  // Whitelist por partner_id
  const whitelist = (process.env.ODOO_SYNC_PARTNER_WHITELIST || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(Number);
  const whitelistActive = whitelist.length > 0;

  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `Factura ${invoiceId} no encontrada` }, { status: 404 });
  }
  const partnerId = invoice.partner_id?.[0];

  if (whitelistActive && !whitelist.includes(partnerId)) {
    return NextResponse.json({
      error: "Partner no esta en whitelist",
      partner_id: partnerId,
      whitelist,
    }, { status: 403 });
  }

  const preview = await previewRegisterPayment({
    invoiceId,
    paymentMethod: body.payment_method,
    paymentReference: body.payment_reference,
    paymentToken: body.payment_token,
    paymentDate: body.payment_date,
  });

  // Audit log
  try {
    const sb = createAdminSupabase();
    await sb.from("odoo_sync_log").insert({
      odoo_partner_id: partnerId || 0,
      odoo_invoice_id: invoiceId,
      odoo_origin: typeof invoice.invoice_origin === "string" ? invoice.invoice_origin : null,
      amount_usd: 0,
      amount_ves: preview.amount || 0,
      bcv_rate: 0,
      bcv_rate_date: preview.payment_date,
      status: preview.ok ? "preview" : "skipped",
      mode: "dry-run",
      error_message: preview.warnings.length > 0 ? preview.warnings.join("; ") : null,
      odoo_response: { preview, type: "register_payment" },
      triggered_by: "manual",
      triggered_by_user_id: caller.id,
      whitelist_active: whitelistActive,
    });
  } catch (err) {
    console.warn("[OdooPaymentRegister Preview] Error guardando audit log:", err);
  }

  const willDo = preview.ok ? [
    `CREATE account.payment.register wizard con context active_model=account.move active_ids=[${invoiceId}]`,
    `Wizard fields: payment_date=${preview.payment_date}, amount=${preview.amount}, journal_id=${preview.mapping.journalId}, payment_method_line_id=${preview.mapping.paymentMethodLineId}, communication="${preview.memo}"`,
    `CALL wizard.action_create_payments() → crea account.payment, lo postea y lo reconcilia con la factura`,
    `VERIFY que invoice.payment_state cambio a "paid" o "in_payment" (sino abort con error)`,
  ] : null;

  return NextResponse.json({
    ok: preview.ok,
    whitelist_active: whitelistActive,
    invoice_id: invoiceId,
    partner_id: partnerId,
    partner_name: invoice.partner_id?.[1] || null,
    invoice_state: preview.invoice_state,
    invoice_payment_state: preview.invoice_payment_state,
    amount: preview.amount,
    currency: preview.currency,
    mapping: preview.mapping,
    payment_date: preview.payment_date,
    memo: preview.memo,
    validations: preview.validations,
    warnings: preview.warnings,
    will_do: willDo,
  });
}
