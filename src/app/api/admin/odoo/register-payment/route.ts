// POST /api/admin/odoo/register-payment
// Sprint 1 REAL: crea account.payment en Odoo y lo reconcilia con la factura.
//
// Body: {
//   invoice_id: number,
//   payment_method: "debito_inmediato" | ...,
//   payment_reference: string,
//   payment_token: string,
//   payment_date?: string  // YYYY-MM-DD, default hoy
// }
//
// 6 capas de seguridad antes de tocar Odoo:
//   1. Auth: super_admin only
//   2. Master kill switch: ODOO_SYNC_ENABLED=true
//   3. Partner whitelist
//   4. Factura debe estar posted (no draft)
//   5. Factura NO debe estar paid ya (idempotencia)
//   6. Mapping del metodo de pago debe existir

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  previewRegisterPayment,
  registerPaymentForInvoice,
  getInvoiceById,
} from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sb = createAdminSupabase();

  // 1. Auth
  const caller = await requirePermission("erp", "update");
  if (!caller || caller.role !== "super_admin") {
    return NextResponse.json({ error: "Solo super_admin puede registrar pagos en Odoo" }, { status: 403 });
  }

  // 2. Kill switch
  if (process.env.ODOO_SYNC_ENABLED !== "true") {
    return NextResponse.json({
      error: "ODOO_SYNC_ENABLED no esta en true. Sync apagado.",
    }, { status: 503 });
  }

  // 3. Body
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

  // 4. Lee factura
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `Factura ${invoiceId} no encontrada` }, { status: 404 });
  }
  if (invoice.state !== "posted") {
    return NextResponse.json({
      error: `Factura ${invoiceId} esta en state="${invoice.state}", debe estar posted`,
    }, { status: 409 });
  }

  // 5. Whitelist
  const whitelist = (process.env.ODOO_SYNC_PARTNER_WHITELIST || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(Number);
  const whitelistActive = whitelist.length > 0;
  const partnerId = invoice.partner_id?.[0];

  if (whitelistActive && !whitelist.includes(partnerId)) {
    return NextResponse.json({
      error: "Partner no esta en whitelist",
      partner_id: partnerId,
      whitelist,
    }, { status: 403 });
  }

  // 6. Run preview (que valida payment_state, mapping, etc.)
  const preview = await previewRegisterPayment({
    invoiceId,
    paymentMethod: body.payment_method,
    paymentReference: body.payment_reference,
    paymentToken: body.payment_token,
    paymentDate: body.payment_date,
  });
  if (!preview.ok) {
    return NextResponse.json({
      error: "Preview no valido — abort",
      warnings: preview.warnings,
    }, { status: 422 });
  }

  // 7. REGISTER REAL
  console.log(`[OdooPaymentRegister] Iniciando registro de pago para factura ${invoiceId} (partner ${partnerId}) por user ${caller.email}`);
  const result = await registerPaymentForInvoice({
    invoiceId,
    paymentMethod: body.payment_method,
    paymentReference: body.payment_reference,
    paymentToken: body.payment_token,
    paymentDate: body.payment_date,
  });
  console.log(`[OdooPaymentRegister] Resultado: ok=${result.ok} payment_name=${result.payment_name} payment_state=${result.invoice_payment_state_after}`);

  // 8. Audit log
  try {
    await sb.from("odoo_sync_log").insert({
      odoo_partner_id: partnerId || 0,
      odoo_invoice_id: invoiceId,
      odoo_invoice_name: typeof invoice.name === "string" ? invoice.name : null,
      odoo_origin: typeof invoice.invoice_origin === "string" ? invoice.invoice_origin : null,
      amount_usd: 0,
      amount_ves: preview.amount,
      bcv_rate: 0,
      bcv_rate_date: preview.payment_date,
      status: result.ok ? "posted" : "failed",
      mode: "real",
      error_message: result.errors?.join("; ") || null,
      odoo_response: {
        type: "register_payment",
        result,
        preview_summary: {
          mapping: preview.mapping,
          memo: preview.memo,
          amount: preview.amount,
        }
      },
      triggered_by: "manual",
      triggered_by_user_id: caller.id,
      whitelist_active: whitelistActive,
    });
  } catch (err) {
    console.error("[OdooPaymentRegister] Error guardando audit log:", err);
  }

  return NextResponse.json({
    ok: result.ok,
    invoice_id: invoiceId,
    payment_id: result.payment_id,
    payment_name: result.payment_name,
    payment_state: result.payment_state,
    invoice_payment_state_after: result.invoice_payment_state_after,
    reconciled: result.reconciled,
    errors: result.errors,
  });
}
