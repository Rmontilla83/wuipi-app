// POST /api/admin/odoo/debug-sync-item — TEMPORARY DEBUG endpoint
// Dispara `triggerOdooSyncOrEnqueue` sobre un collection_item específico y
// devuelve el resultado completo. Útil cuando el webhook marca el item paid
// pero el sync nunca llega a encolar (silencioso).
//
// NO requiere super_admin (es para debug puntual). Quitar al terminar.

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/check-permission";
import {
  findOdooPartnerByIdentifiers,
  findLatestDraftInvoiceForPartner,
  syncOdooForCollectionItem,
  PAYMENT_METHOD_MAPPING,
} from "@/lib/integrations/odoo";
import { extractInvoiceSyncFields } from "@/lib/integrations/odoo-sync-trigger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const caller = await requirePermission("erp", "read");
  if (!caller) {
    return NextResponse.json({ error: "no auth" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const itemId = body.item_id as string | undefined;
  if (!itemId) return NextResponse.json({ error: "item_id requerido" }, { status: 400 });

  const sb = createAdminSupabase();
  const { data: item, error } = await sb
    .from("collection_items")
    .select("*")
    .eq("id", itemId)
    .single();
  if (error || !item) return NextResponse.json({ error: "item no encontrado", detail: error?.message }, { status: 404 });

  const trace: Record<string, unknown> = {};
  trace.item = {
    id: item.id,
    customer_cedula_rif: item.customer_cedula_rif,
    customer_email: item.customer_email,
    amount_usd: item.amount_usd,
    status: item.status,
    payment_method: item.payment_method,
  };
  trace.sync_enabled = process.env.ODOO_SYNC_ENABLED;
  trace.has_mapping = !!PAYMENT_METHOD_MAPPING[item.payment_method];

  // Step 1: lookup partner
  let partnerId: number | null = null;
  try {
    partnerId = await findOdooPartnerByIdentifiers({
      vat: item.customer_cedula_rif,
      email: item.customer_email,
    });
    trace.partner_lookup = { ok: true, partnerId };
  } catch (e) {
    trace.partner_lookup = { ok: false, error: e instanceof Error ? e.message : String(e) };
    return NextResponse.json(trace);
  }
  if (!partnerId) {
    trace.partner_lookup_result = "PARTNER NOT FOUND";
    return NextResponse.json(trace);
  }

  // Step 2: invoice ids
  const { odooInvoiceIds, invoiceAmountsUsd } = extractInvoiceSyncFields(item.metadata);
  let invoiceIds: number[] = odooInvoiceIds ?? [];
  if (invoiceIds.length === 0) {
    try {
      const single = await findLatestDraftInvoiceForPartner(partnerId);
      if (single) invoiceIds = [single];
    } catch (e) {
      trace.invoice_lookup = { ok: false, error: e instanceof Error ? e.message : String(e) };
      return NextResponse.json(trace);
    }
  }
  trace.invoice_ids = invoiceIds;
  trace.amounts_map = invoiceAmountsUsd;

  if (invoiceIds.length === 0) {
    trace.invoice_lookup_result = "NO DRAFT INVOICE FOUND";
    return NextResponse.json(trace);
  }

  // Step 3: sync each invoice
  const results: unknown[] = [];
  for (const invoiceId of invoiceIds) {
    try {
      const r = await syncOdooForCollectionItem({
        invoiceId,
        paymentMethod: item.payment_method,
        paymentReference: "",
        paymentToken: item.payment_token,
        paymentDate: new Date().toISOString().slice(0, 10),
      });
      results.push({ invoiceId, result: r });
    } catch (e) {
      results.push({
        invoiceId,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack?.split("\n").slice(0, 6) : null,
      });
    }
  }
  trace.results = results;
  return NextResponse.json(trace);
}
