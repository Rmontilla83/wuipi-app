// POST /api/admin/odoo/post-invoice
// POSTING REAL — modifica Odoo. Usar solo tras validar dry-run.
// Body: { invoice_id: number, expected_amount_ves?: number }
//
// Si expected_amount_ves esta presente, valida que el monto VES calculado
// coincida +/- 10% antes de proceder. Esto previene postings erroneos si
// algo cambio entre el preview y el posting.
//
// 5 capas de seguridad (TODAS obligatorias antes de tocar Odoo):
//   1. Auth: super_admin only
//   2. Master kill switch: ODOO_SYNC_ENABLED === "true"
//   3. Partner whitelist: ODOO_SYNC_PARTNER_WHITELIST debe contener partner_id
//   4. Estado factura: debe ser draft (no posted, no cancelled)
//   5. Match expected_amount_ves: si se provee, calculado debe estar +/- 10%

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  previewInvoicePosting,
  postInvoiceInVes,
  getInvoiceById,
} from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sb = createAdminSupabase();

  // 1. Auth — super_admin only
  const caller = await requirePermission("erp", "update");
  if (!caller || caller.role !== "super_admin") {
    return NextResponse.json({ error: "Solo super_admin puede postear facturas en Odoo" }, { status: 403 });
  }

  // 2. Master kill switch
  if (process.env.ODOO_SYNC_ENABLED !== "true") {
    return NextResponse.json({
      error: "ODOO_SYNC_ENABLED no esta en true. Sync apagado.",
      hint: "Set ODOO_SYNC_ENABLED=true en Vercel y redeploy para habilitar",
    }, { status: 503 });
  }

  // 3. Body
  let body: { invoice_id?: number; expected_amount_ves?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const invoiceId = Number(body.invoice_id);
  if (!invoiceId || !Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "invoice_id requerido (numero entero positivo)" }, { status: 400 });
  }

  // 4. Lee factura para validar
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `Factura ${invoiceId} no encontrada` }, { status: 404 });
  }
  if (invoice.state !== "draft") {
    return NextResponse.json({
      error: `Factura ${invoiceId} esta en estado "${invoice.state}", no draft. No se puede postear.`,
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

  // 6. Run preview para validacion final
  const preview = await previewInvoicePosting(invoiceId);
  if (!preview.ok) {
    return NextResponse.json({
      error: "Preview no valido — abort",
      warnings: preview.warnings,
    }, { status: 422 });
  }

  // 7. Validar expected_amount_ves si se provee (tolerancia 10%)
  if (typeof body.expected_amount_ves === "number" && body.expected_amount_ves > 0) {
    const calculated = preview.totals.total_ves;
    const expected = body.expected_amount_ves;
    const diff = Math.abs(calculated - expected) / expected;
    if (diff > 0.10) {
      return NextResponse.json({
        error: "Monto VES calculado difiere mas de 10% del esperado — abort por seguridad",
        calculated,
        expected,
        diff_pct: (diff * 100).toFixed(2),
      }, { status: 422 });
    }
  }

  // 8. Idempotencia — chequear que no haya un posting exitoso previo
  const { data: priorPosts } = await sb
    .from("odoo_sync_log")
    .select("id, status, mode, created_at")
    .eq("odoo_invoice_id", invoiceId)
    .eq("status", "posted")
    .eq("mode", "real")
    .limit(1);

  if (priorPosts && priorPosts.length > 0) {
    return NextResponse.json({
      error: "Esta factura ya fue posteada previamente",
      previous_post: priorPosts[0],
    }, { status: 409 });
  }

  // 9. POSTING REAL
  console.log(`[OdooSync POST] Iniciando posting de factura ${invoiceId} (partner ${partnerId}) por user ${caller.email}`);
  const result = await postInvoiceInVes(invoiceId);
  console.log(`[OdooSync POST] Resultado: ok=${result.ok} name=${result.invoice_name} amount_ves=${result.amount_ves}`);

  // 10. Audit log con el resultado
  try {
    await sb.from("odoo_sync_log").insert({
      odoo_partner_id: partnerId || 0,
      odoo_invoice_id: invoiceId,
      odoo_invoice_name: typeof result.invoice_name === "string" ? result.invoice_name : null,
      odoo_origin: typeof invoice.invoice_origin === "string" ? invoice.invoice_origin : null,
      amount_usd: preview.totals.total_usd,
      amount_ves: result.amount_ves,
      bcv_rate: result.bcv_rate,
      bcv_rate_date: preview.rate.date,
      status: result.ok ? "posted" : "failed",
      mode: "real",
      error_message: result.errors?.join("; ") || null,
      odoo_response: { result, preview_summary: preview.totals },
      triggered_by: "manual",
      triggered_by_user_id: caller.id,
      whitelist_active: whitelistActive,
    });
  } catch (err) {
    console.error("[OdooSync POST] Error guardando audit log:", err);
  }

  return NextResponse.json({
    ok: result.ok,
    invoice_id: result.invoice_id,
    invoice_name: result.invoice_name,
    partner_id: result.partner_id,
    amount_ves: result.amount_ves,
    bcv_rate: result.bcv_rate,
    errors: result.errors,
  });
}
