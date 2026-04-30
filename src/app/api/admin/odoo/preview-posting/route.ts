// POST /api/admin/odoo/preview-posting
// Dry-run del posting de una factura. NO toca Odoo.
// Body: { invoice_id: number }
//
// Calcula que quedaria si se posteara la factura en VES, sin escribir nada.
// Util para validar manualmente antes de hacer el posting real.
//
// Requiere: super_admin
// Whitelist: respeta ODOO_SYNC_PARTNER_WHITELIST (si esta seteada)

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { previewInvoicePosting, getInvoiceById } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. Auth — solo super_admin
  const caller = await requirePermission("erp", "update");
  if (!caller || caller.role !== "super_admin") {
    return NextResponse.json({ error: "Solo super_admin puede ejecutar previews de Odoo" }, { status: 403 });
  }

  // 2. Body
  let body: { invoice_id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const invoiceId = Number(body.invoice_id);
  if (!invoiceId || !Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "invoice_id requerido (numero entero positivo)" }, { status: 400 });
  }

  // 3. Whitelist (preview tambien la respeta — no queremos que admin pruebe con cuentas no permitidas)
  const whitelist = (process.env.ODOO_SYNC_PARTNER_WHITELIST || "")
    .split(",").map(s => s.trim()).filter(Boolean).map(Number);
  const whitelistActive = whitelist.length > 0;

  // 4. Lee la factura primero para validar partner
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `Factura ${invoiceId} no encontrada en Odoo` }, { status: 404 });
  }

  const partnerId = invoice.partner_id?.[0];
  if (whitelistActive && !whitelist.includes(partnerId)) {
    return NextResponse.json({
      error: "Partner no esta en whitelist",
      partner_id: partnerId,
      whitelist,
      hint: "Agregar partner_id a env var ODOO_SYNC_PARTNER_WHITELIST y redeploy",
    }, { status: 403 });
  }

  // 5. Run preview
  const preview = await previewInvoicePosting(invoiceId);

  // 6. Audit log
  try {
    const sb = createAdminSupabase();
    await sb.from("odoo_sync_log").insert({
      odoo_partner_id: partnerId || 0,
      odoo_invoice_id: invoiceId,
      odoo_origin: typeof invoice.invoice_origin === "string" ? invoice.invoice_origin : null,
      amount_usd: preview.totals?.total_usd || 0,
      amount_ves: preview.totals?.total_ves || 0,
      bcv_rate: preview.rate?.bsPerUsd || 0,
      bcv_rate_date: preview.rate?.date || null,
      status: preview.ok ? "preview" : "skipped",
      mode: "dry-run",
      error_message: preview.warnings.length > 0 ? preview.warnings.join("; ") : null,
      odoo_response: { preview },
      triggered_by: "manual",
      triggered_by_user_id: caller.id,
      whitelist_active: whitelistActive,
    });
  } catch (err) {
    console.warn("[OdooSync Preview] Error guardando audit log:", err);
  }

  // 7. Devolver
  return NextResponse.json({
    ok: preview.ok,
    whitelist_active: whitelistActive,
    invoice_id: invoiceId,
    partner_id: partnerId,
    partner_name: invoice.partner_id?.[1] || null,
    invoice_state: invoice.state,
    invoice_origin: invoice.invoice_origin,
    rate: preview.rate,
    conversion: preview.conversion,
    totals: preview.totals,
    validations: preview.validations,
    warnings: preview.warnings,
    will_do: preview.ok ? {
      step_1: `WRITE account.move id=${invoiceId} → currency_id = VED`,
      step_2: `WRITE ${preview.lines.length} account.move.line(s) → price_unit *= ${preview.rate.bsPerUsd.toFixed(4)}`,
      step_3: `CALL account.move(${invoiceId}).action_post() → factura queda posted en ${preview.totals.total_ves} Bs`,
    } : null,
  });
}
