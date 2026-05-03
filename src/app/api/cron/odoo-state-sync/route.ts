// ===========================================
// CRON: Polling diferencial Odoo
// ===========================================
//
// Detecta cuando una factura linkeada a un collection_item activo (pending/
// sent/viewed/conciliating) se marca como paid en Odoo por un canal EXTERNO
// a nuestra app — ej. el personal cobra en oficina y registra el pago
// directamente en Odoo, o el equipo administrativo concilia un pago de
// banco que llego por canal alternativo.
//
// Sin este cron, ese tipo de pagos no se reflejaria en nuestra DB y el
// sistema seguiria mandando recordatorios "tienes deuda" a un cliente que
// ya pago. Tambien quedarian casos abiertos en el Kanban que el agente
// tendria que cerrar manualmente.
//
// Estrategia:
//   1. Listar collection_items activos con metadata.odoo_invoice_ids
//   2. Batch query a Odoo: leer state/payment_state/amount_residual de
//      todas esas facturas en UNA sola call
//   3. Por cada item, evaluar si TODAS sus facturas linkeadas estan paid
//      (state=posted + amount_residual=0 + payment_state in paid|in_payment)
//   4. Si si: markItemPaid + closeOpenCasesForPaidItem
//
// Schedule: */15 * * * * — latencia maxima de 15 min entre pago en Odoo
// y refresco de nuestra DB. Aceptable para cobranza.
//
// Items SIN odoo_invoice_ids en metadata se ignoran — no podemos
// matchearlos sin asumir cosas riesgosas. Esos llegan via los flujos
// estandar (Mercantil/C2P/Stripe/PayPal) con webhook real.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { searchRead, isOdooConfigured } from "@/lib/integrations/odoo";
import { markItemPaid } from "@/lib/dal/collection-campaigns";
import { closeOpenCasesForPaidItem } from "@/lib/cobranzas/payment-failure-case";

// Cuantos items procesar por corrida — evita timeout en backlog grande.
// Si quedan mas, los procesa la siguiente corrida del cron */15.
const BATCH_SIZE = 200;

interface OdooInvoiceState {
  id: number;
  state: string;
  payment_state: string;
  amount_residual: number;
}

export async function GET(request: NextRequest) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const stats = {
    items_checked: 0,
    items_with_no_odoo_link: 0,
    items_marked_paid: 0,
    items_partial_paid: 0,
    cases_closed: 0,
    odoo_invoices_queried: 0,
    errors: [] as string[],
  };

  if (!isOdooConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "Odoo no configurado (faltan ODOO_URL/ODOO_DB/ODOO_USER/ODOO_API_KEY)",
      stats,
    }, { status: 503 });
  }

  const sb = createAdminSupabase();

  try {
    // 1. Items activos con potencial de cambio
    const { data: items, error } = await sb
      .from("collection_items")
      .select("id, payment_token, status, customer_name, customer_cedula_rif, amount_usd, metadata")
      .in("status", ["pending", "sent", "viewed", "conciliating"])
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw new Error(error.message);
    if (!items || items.length === 0) {
      return NextResponse.json({ ok: true, stats, ran_at: new Date().toISOString() });
    }

    // 2. Extraer todos los odoo_invoice_ids de los metadata
    const itemInvoiceMap = new Map<string, number[]>();  // item_id -> [invoice_ids]
    const allInvoiceIds = new Set<number>();
    for (const item of items) {
      const meta = (item.metadata as Record<string, unknown> | null) || {};
      const rawIds = meta.odoo_invoice_ids;
      const ids = Array.isArray(rawIds)
        ? (rawIds as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0)
        : [];
      if (ids.length === 0) {
        stats.items_with_no_odoo_link++;
        continue;
      }
      itemInvoiceMap.set(item.id, ids);
      ids.forEach(id => allInvoiceIds.add(id));
    }

    if (allInvoiceIds.size === 0) {
      // Nada que checkear este ciclo
      return NextResponse.json({ ok: true, stats, ran_at: new Date().toISOString() });
    }

    // 3. Batch query Odoo: una sola call con todos los invoice_ids
    let odooInvoices: OdooInvoiceState[] = [];
    try {
      const result = await searchRead(
        "account.move",
        [["id", "in", Array.from(allInvoiceIds)]],
        {
          fields: ["id", "state", "payment_state", "amount_residual"],
          limit: 1000,
        }
      );
      odooInvoices = (result || []) as OdooInvoiceState[];
      stats.odoo_invoices_queried = odooInvoices.length;
    } catch (err) {
      stats.errors.push(`Odoo searchRead failed: ${err instanceof Error ? err.message : "unknown"}`);
      return NextResponse.json({ ok: false, stats, error: stats.errors[0] }, { status: 500 });
    }

    // Index por id para lookup O(1)
    const odooById = new Map<number, OdooInvoiceState>();
    for (const inv of odooInvoices) odooById.set(inv.id, inv);

    function isInvoiceFullyPaid(inv: OdooInvoiceState | undefined): boolean {
      if (!inv) return false;
      return inv.state === "posted"
        && Number(inv.amount_residual) === 0
        && (inv.payment_state === "paid" || inv.payment_state === "in_payment");
    }

    // 4. Por cada item, decidir si todas sus facturas estan paid
    for (const item of items) {
      stats.items_checked++;
      const linkedIds = itemInvoiceMap.get(item.id);
      if (!linkedIds || linkedIds.length === 0) continue;

      const states = linkedIds.map(id => isInvoiceFullyPaid(odooById.get(id)));
      const allPaid = states.length > 0 && states.every(Boolean);
      const somePaid = states.some(Boolean);

      if (!allPaid && somePaid) {
        // Caso parcial — algunas facturas pagadas, otras no. Por ahora no
        // marcamos el item como paid (puede ser que el cliente pago una
        // factura por separado). Solo loggeamos.
        stats.items_partial_paid++;
        continue;
      }

      if (!allPaid) continue;

      // 5. Todas las facturas linkeadas estan paid en Odoo. Reflejarlo.
      try {
        const today = new Date().toISOString().slice(0, 10);
        const result = await markItemPaid(item.payment_token, {
          payment_method: "external_odoo",
          payment_reference: `EXTERNAL-ODOO-${today}`,
        });
        const wasAlreadyPaid = (result as { wasAlreadyPaid?: boolean }).wasAlreadyPaid === true;

        // Solo contamos el primero que gana la race. Si otro flow ya marco
        // paid (poco probable porque el item estaba en pending/etc), saltamos.
        if (!wasAlreadyPaid) {
          stats.items_marked_paid++;

          // Cerrar casos del kanban (escenario tipico: caso falla_pasarela
          // abierto de un intento previo, ahora resuelto porque pago).
          try {
            const closeResult = await closeOpenCasesForPaidItem(item.id);
            stats.cases_closed += closeResult.closed;
          } catch (err) {
            stats.errors.push(
              `closeCases ${item.id}: ${err instanceof Error ? err.message : "unknown"}`
            );
          }
        }
      } catch (err) {
        stats.errors.push(
          `markPaid ${item.id}: ${err instanceof Error ? err.message : "unknown"}`
        );
      }
    }

    console.log(
      `[cron/odoo-state-sync] checked=${stats.items_checked} ` +
      `marked=${stats.items_marked_paid} cases_closed=${stats.cases_closed} ` +
      `partial=${stats.items_partial_paid} no_link=${stats.items_with_no_odoo_link} ` +
      `errors=${stats.errors.length}`
    );

    return NextResponse.json({
      ok: true,
      stats,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/odoo-state-sync] exception:", err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
      stats,
    }, { status: 500 });
  }
}
