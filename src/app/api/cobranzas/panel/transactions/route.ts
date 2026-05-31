// GET /api/cobranzas/panel/transactions
//
// Lista paginada de transacciones de collection_items con filtros.
// Solo lectura. Acceso: roles con permiso cobranzas:read.
//
// Por qué `panel/` en el path: ya existe /api/cobranzas/[token]/route.ts.
// Aunque Next.js prefiere rutas estáticas sobre dinámicas, agregamos un
// segmento explícito para que no haya ambigüedad ahora ni si en el futuro
// alguien crea /api/cobranzas/[token]/transactions/route.ts.

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiServerError, apiSuccess } from "@/lib/api-helpers";
import { rangeForPeriod, type Period } from "@/lib/cobranzas/period-helpers";
import type { TxListItem, TxListResponse, SyncStatus } from "@/lib/cobranzas/types";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

function parsePeriod(value: string | null): Period {
  if (value === "hoy" || value === "7d" || value === "30d" || value === "mes" || value === "custom") {
    return value;
  }
  return "7d";
}

function syncStatusFromQueue(
  row: { status: string; resolved_manually: boolean } | null | undefined,
): SyncStatus {
  if (!row) return "none";
  if (row.resolved_manually) return "synced";
  const s = row.status;
  if (s === "done") return "synced";
  if (s === "pending") return "pending";
  if (s === "retrying") return "retrying";
  if (s === "manual_review") return "manual_review";
  if (s === "cancelled") return "cancelled";
  return "pending";
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("No autorizado", 401);

    const sp = req.nextUrl.searchParams;

    const period = parsePeriod(sp.get("period"));
    const range = rangeForPeriod(period, sp.get("from"), sp.get("to"));
    const search = (sp.get("q") || "").trim();
    const methods = sp.getAll("method").filter(Boolean);
    const statuses = sp.getAll("status").filter(Boolean);
    const syncFilter = sp.getAll("sync").filter(Boolean);

    const pageRaw = Number(sp.get("page") || "1");
    const sizeRaw = Number(sp.get("pageSize") || PAGE_SIZE_DEFAULT);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const pageSize = Math.min(
      Math.max(Number.isFinite(sizeRaw) ? Math.floor(sizeRaw) : PAGE_SIZE_DEFAULT, 1),
      PAGE_SIZE_MAX,
    );

    const db = createAdminSupabase();

    // Por fecha: status="paid" -> usar paid_at; resto -> usar created_at.
    // Como Postgres no soporta filtros condicionales fáciles aquí, agrupamos:
    // si el usuario pidió solo "paid" filtramos por paid_at; si pidió otros o
    // todos, filtramos por created_at (más permisivo, incluye intentos previos).
    const onlyPaid = statuses.length === 1 && statuses[0] === "paid";
    const dateColumn = onlyPaid ? "paid_at" : "created_at";

    let q = db
      .from("collection_items")
      .select(
        "id, paid_at, created_at, customer_name, customer_cedula_rif, amount_usd, amount_bss, payment_method, payment_reference, status, invoice_number, metadata",
        { count: "exact" },
      )
      .gte(dateColumn, range.from)
      .lt(dateColumn, range.to);

    if (statuses.length > 0) q = q.in("status", statuses);
    if (methods.length > 0) q = q.in("payment_method", methods);

    if (search) {
      // Búsqueda libre en cliente, cédula, ref. banco, factura.
      // Escape de comas/parens en el patrón ILIKE de PostgREST.
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

    q = q.order(dateColumn, { ascending: false, nullsFirst: false }).range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );

    const { data: items, count, error } = await q;
    if (error) {
      console.error("[cobranzas/panel/transactions] list error:", error);
      return apiServerError(error);
    }

    const itemIds = (items || []).map((i) => i.id);
    const syncByItem: Record<string, { status: string; resolved_manually: boolean; last_error: string | null }> = {};
    if (itemIds.length > 0) {
      const { data: syncRows } = await db
        .from("odoo_sync_queue")
        .select("collection_item_id, status, resolved_manually, last_error")
        .in("collection_item_id", itemIds);

      for (const r of syncRows || []) {
        syncByItem[r.collection_item_id] = {
          status: r.status,
          resolved_manually: r.resolved_manually,
          last_error: r.last_error,
        };
      }
    }

    const rows: TxListItem[] = (items || []).map((it) => {
      const sync = syncByItem[it.id];
      const sync_status = syncStatusFromQueue(sync);

      // Si el filtro de sync está activo, lo aplicamos en memoria (no es
      // un campo nativo de collection_items y un join filtrante nos forzaría
      // a otra arquitectura).
      const invoices = (it.metadata as { odoo_invoices?: Array<{ number?: string }> } | null)
        ?.odoo_invoices;
      const invoiceFromMeta = invoices && invoices.length > 0 ? invoices[0]?.number : null;

      return {
        id: it.id,
        paid_at: it.paid_at,
        created_at: it.created_at,
        customer_name: it.customer_name,
        customer_cedula_rif: it.customer_cedula_rif,
        amount_usd: Number(it.amount_usd) || 0,
        amount_bss: it.amount_bss ? Number(it.amount_bss) : null,
        payment_method: it.payment_method as TxListItem["payment_method"],
        payment_reference: it.payment_reference,
        status: it.status as TxListItem["status"],
        invoice_number: it.invoice_number || invoiceFromMeta || null,
        sync_status,
        sync_error_short: sync?.last_error ? sync.last_error.slice(0, 140) : null,
      };
    });

    const filtered = syncFilter.length > 0
      ? rows.filter((r) => syncFilter.includes(r.sync_status))
      : rows;

    const response: TxListResponse = {
      items: filtered,
      total: count || 0,
      page,
      pageSize,
    };

    return apiSuccess(response);
  } catch (err) {
    return apiServerError(err);
  }
}
