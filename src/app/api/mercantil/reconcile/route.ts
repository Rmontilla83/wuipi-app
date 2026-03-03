import { NextRequest } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { MercantilSDK } from "@/lib/mercantil";

export const dynamic = "force-dynamic";

/**
 * POST /api/mercantil/reconcile
 * Runs reconciliation against Mercantil APIs.
 * Requires admin authentication.
 *
 * Body: { date_from: string, date_to: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();
    const adminSupabase = createAdminSupabase();

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return apiError("No autorizado", 401);

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "gerente", "finanzas"].includes(profile.role)) {
      return apiError("Sin permisos para conciliación", 403);
    }

    const body = await request.json();
    const { date_from, date_to } = body;

    if (!date_from || !date_to) {
      return apiError("Debe proveer date_from y date_to (YYYY-MM-DD)", 400);
    }

    const sdk = new MercantilSDK();

    if (!sdk.isConfigured) {
      return apiError(
        "SDK Mercantil no configurado. Las credenciales están pendientes del banco.",
        503
      );
    }

    // Fetch all three payment types in parallel
    const [transfers, mobilePayments, cardPayments] = await Promise.all([
      sdk.searchTransfers({ dateFrom: date_from, dateTo: date_to }).catch(() => []),
      sdk.searchMobilePayments({ dateFrom: date_from, dateTo: date_to }).catch(() => []),
      sdk.searchCardPayments({ dateFrom: date_from, dateTo: date_to }).catch(() => []),
    ]);

    // Get pending payments from DB for the date range
    const { data: pendingPayments } = await adminSupabase
      .from("payments")
      .select("*")
      .in("status", ["pending", "confirmed"])
      .gte("created_at", `${date_from}T00:00:00`)
      .lte("created_at", `${date_to}T23:59:59`);

    let matched = 0;
    let unmatched = 0;

    // Match transfers with pending payments
    const allTransactions = [
      ...transfers.map((t) => ({ ...t, type: "transfer" })),
      ...(mobilePayments as Array<{ reference_number: string; amount: number; status: string }>).map(
        (t) => ({ ...t, type: "mobile" })
      ),
      ...(cardPayments as Array<{ reference_number: string; amount: number; status: string }>).map(
        (t) => ({ ...t, type: "card" })
      ),
    ];

    for (const txn of allTransactions) {
      const match = pendingPayments?.find(
        (p) =>
          p.reference_number === txn.reference_number ||
          p.gateway_reference === txn.reference_number
      );

      if (match) {
        matched++;
        // Update if still pending
        if (match.status === "pending" && txn.status === "approved") {
          await adminSupabase
            .from("payments")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
              confirmed_by: "reconciliation",
              gateway_response: txn as unknown as Record<string, unknown>,
            })
            .eq("id", match.id);
        }
      } else {
        unmatched++;
      }
    }

    // Save reconciliation record
    const { data: reconciliation } = await adminSupabase
      .from("payment_reconciliation")
      .insert({
        date_from,
        date_to,
        total_transactions: allTransactions.length,
        matched,
        unmatched,
        transfers_count: transfers.length,
        mobile_payments_count: (mobilePayments as unknown[]).length,
        card_payments_count: (cardPayments as unknown[]).length,
        details: {
          transfers: transfers.length,
          mobile: (mobilePayments as unknown[]).length,
          cards: (cardPayments as unknown[]).length,
        },
        run_by: user.id,
      })
      .select()
      .single();

    console.log(
      `[Mercantil Reconcile] ${date_from} to ${date_to}: ${matched} matched, ${unmatched} unmatched of ${allTransactions.length} total`
    );

    return apiSuccess({
      reconciliation_id: reconciliation?.id,
      date_from,
      date_to,
      total_transactions: allTransactions.length,
      matched,
      unmatched,
      breakdown: {
        transfers: transfers.length,
        mobile_payments: (mobilePayments as unknown[]).length,
        card_payments: (cardPayments as unknown[]).length,
      },
    });
  } catch (error) {
    return apiServerError(error);
  }
}
