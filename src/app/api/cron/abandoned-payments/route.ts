// ===========================================
// CRON: Detector de pagos abandonados
// ===========================================
// Cliente abre /pagar/[token] -> status pasa a 'viewed'. Si pasan ABANDONED_MINUTES
// y aun no llega webhook (status sigue 'viewed' y NOT 'paid'/'conciliating'/'failed'),
// se interpreta como abandono. Crea caso 'falla_pasarela' con failureType='abandoned'
// y dispara mensaje WA "vimos un inconveniente" (en modo dry-run hasta que se
// active COBRANZAS_WA_DRY_RUN=false).
//
// Schedule: cada 15 minutos. Se evalua en el cron, no via realtime.
//
// Idempotencia: createPaymentFailureCase tiene UNIQUE INDEX en
// (source_collection_item_id, stage='falla_pasarela', closed_at IS NULL),
// asi que si el item ya tiene caso abierto, no se duplica.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { createPaymentFailureCase } from "@/lib/cobranzas/payment-failure-case";

// Tiempo en minutos que un item puede estar 'viewed' antes de considerarlo abandono.
// Configurable via env para A/B testing rapido sin redeploy.
const ABANDONED_MINUTES = Number(process.env.COBRANZAS_ABANDONED_MINUTES || "60");

// Limite de items a procesar por corrida del cron (evita timeout en runs grandes)
const BATCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const sb = createAdminSupabase();
  const now = new Date();
  const cutoff = new Date(now.getTime() - ABANDONED_MINUTES * 60 * 1000).toISOString();

  const stats = {
    cutoff_minutes: ABANDONED_MINUTES,
    candidates_found: 0,
    cases_created: 0,
    cases_already_existed: 0,
    cases_failed: 0,
    errors: [] as string[],
  };

  try {
    // Buscar items 'viewed' que llevan mas de ABANDONED_MINUTES sin avanzar.
    // Usamos `updated_at` (no `created_at`) porque el item pudo crearse hace
    // dias y solo recien hoy el cliente abrio el link.
    const { data: candidates, error } = await sb
      .from("collection_items")
      .select("id, payment_token, customer_name, customer_cedula_rif, customer_phone, customer_email, amount_usd, status, updated_at")
      .eq("status", "viewed")
      .lte("updated_at", cutoff)
      .limit(BATCH_LIMIT);

    if (error) throw new Error(error.message);
    stats.candidates_found = candidates?.length || 0;

    for (const item of candidates || []) {
      try {
        const result = await createPaymentFailureCase({
          collectionItemId: item.id,
          gateway: "mercantil",  // gateway desconocido al abandonar — usar mercantil como default (es el mas comun)
          gatewayProduct: "abandoned_session",
          failureType: "abandoned",
          errorMessage: `Cliente abrio el link y no completo el pago en ${ABANDONED_MINUTES} min`,
        });

        if (!result.ok) {
          stats.cases_failed++;
          stats.errors.push(`item ${item.id}: ${result.error}`);
        } else if (result.alreadyExisted) {
          stats.cases_already_existed++;
        } else {
          stats.cases_created++;
        }
      } catch (err) {
        stats.cases_failed++;
        stats.errors.push(`item ${item.id}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    console.log(
      `[cron/abandoned-payments] cutoff=${ABANDONED_MINUTES}min ` +
      `found=${stats.candidates_found} created=${stats.cases_created} ` +
      `already=${stats.cases_already_existed} failed=${stats.cases_failed}`
    );

    return NextResponse.json({ ok: true, stats, ran_at: now.toISOString() });
  } catch (err) {
    console.error("[cron/abandoned-payments] exception:", err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
      stats,
    }, { status: 500 });
  }
}
