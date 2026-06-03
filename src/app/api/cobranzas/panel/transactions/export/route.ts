// GET /api/cobranzas/panel/transactions/export
//
// CSV de transacciones que respeta los filtros activos. Cap a 5000 filas
// (más que eso debería pedir el rango más corto).
// Acceso: roles con permiso cobranzas:export.

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiServerError } from "@/lib/api-helpers";
import { rangeForPeriod, type Period, formatCaracas } from "@/lib/cobranzas/period-helpers";

const ROW_CAP = 5000;

const METHOD_LABEL: Record<string, string> = {
  debito_inmediato: "Mercantil (débito inmediato)",
  transferencia: "Mercantil (transferencia P2P)",
  c2p: "Mercantil (C2P)",
  paypal: "PayPal",
  stripe: "Stripe",
  cash: "Caja efectivo",
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parsePeriod(value: string | null): Period {
  if (value === "hoy" || value === "7d" || value === "30d" || value === "mes" || value === "custom") {
    return value;
  }
  return "7d";
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "export");
    if (!caller) {
      // Fallback: si no tiene "export" pero sí "read", también lo dejamos
      // (export es solo bajar lo que ya ve). Esto matchea la práctica del resto
      // de la app — analista_cobranzas tiene ambos.
      const reader = await requirePermission("cobranzas", "read");
      if (!reader) return apiError("No autorizado", 401);
    }

    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("period"));
    const range = rangeForPeriod(period, sp.get("from"), sp.get("to"));
    const search = (sp.get("q") || "").trim();
    const methods = sp.getAll("method").filter(Boolean);
    const statuses = sp.getAll("status").filter(Boolean);

    const db = createAdminSupabase();
    const onlyPaid = statuses.length === 1 && statuses[0] === "paid";
    const dateColumn = onlyPaid ? "paid_at" : "created_at";

    let q = db
      .from("collection_items")
      .select(
        "id, paid_at, created_at, customer_name, customer_cedula_rif, amount_usd, amount_bss, payment_method, payment_reference, status, invoice_number, metadata, odoo_sync_synced_at",
      )
      .gte(dateColumn, range.from)
      .lt(dateColumn, range.to);

    if (statuses.length > 0) q = q.in("status", statuses);
    if (methods.length > 0) q = q.in("payment_method", methods);
    if (search) {
      const safe = search.replace(/[,()]/g, " ").trim();
      q = q.or(
        [
          `customer_name.ilike.%${safe}%`,
          `customer_cedula_rif.ilike.%${safe}%`,
          `payment_reference.ilike.%${safe}%`,
          `invoice_number.ilike.%${safe}%`,
        ].join(","),
      );
    }
    q = q.order(dateColumn, { ascending: false, nullsFirst: false }).limit(ROW_CAP);

    const { data: items, error } = await q;
    if (error) return apiServerError(error);

    const ids = (items || []).map((i) => i.id);
    const syncByItem: Record<string, { status: string; last_error: string | null }> = {};
    if (ids.length > 0) {
      const { data: syncRows } = await db
        .from("odoo_sync_queue")
        .select("collection_item_id, status, last_error, resolved_manually")
        .in("collection_item_id", ids);
      for (const r of syncRows || []) {
        syncByItem[r.collection_item_id] = {
          status: r.resolved_manually ? "synced" : r.status,
          last_error: r.last_error,
        };
      }
    }

    const headers = [
      "fecha_creado_vet",
      "fecha_pago_vet",
      "cliente",
      "cedula_rif",
      "metodo",
      "monto_usd",
      "monto_bs",
      "ref_externa",
      "factura",
      "estado",
      "sync_odoo",
      "sync_error",
    ];

    const lines: string[] = [headers.join(",")];
    for (const it of items || []) {
      const sync = syncByItem[it.id];
      const meta = (it.metadata || {}) as { odoo_invoices?: Array<{ number?: string }> };
      const invoiceFromMeta = meta.odoo_invoices?.[0]?.number;

      // Sin entrada en cola:
      //   synced_at → sync sincrónico exitoso
      //   no paid → no aplica (cliente no pagó)
      //   paid sin nada → sin sincronizar (huérfano real)
      const syncLabel = sync
        ? sync.status
        : it.odoo_sync_synced_at
        ? "synced"
        : it.status !== "paid"
        ? "no aplica"
        : "sin sincronizar";

      const row = [
        formatCaracas(it.created_at),
        formatCaracas(it.paid_at),
        it.customer_name,
        it.customer_cedula_rif,
        METHOD_LABEL[it.payment_method] || it.payment_method,
        it.amount_usd,
        it.amount_bss ?? "",
        it.payment_reference ?? "",
        it.invoice_number || invoiceFromMeta || "",
        it.status,
        syncLabel,
        sync?.last_error ? sync.last_error.slice(0, 200) : "",
      ].map(csvEscape).join(",");
      lines.push(row);
    }

    const csv = lines.join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cobranzas-transacciones-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiServerError(err);
  }
}
