import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { MercantilSDK } from "@/lib/mercantil";
import { markItemPaid } from "@/lib/dal/collection-campaigns";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/mercantil/webhook
 * Receives payment notifications from Banco Mercantil.
 *
 * Authentication model:
 *  - Mercantil does NOT send an auth header or HMAC signature.
 *  - Authenticity is proved by the ability to decrypt `transactionData` with one
 *    of our pre-shared product secretKeys (AES-256). Plain-JSON payloads are
 *    REJECTED — historical fallback to plain JSON was a bypass.
 *
 * Defenses in order of evaluation:
 *  1. Rate limit per IP (100/min) — bounds cost of decrypt attempts
 *  2. Optional IP allowlist via MERCANTIL_WEBHOOK_ALLOWED_IPS
 *  3. Mandatory `transactionData` cipher field (rejects plain JSON)
 *  4. integratorId check against config
 *  5. Timestamp freshness (<= 15 min old)
 *  6. Idempotency by reference_number — dedup replays
 *
 * Returns 200 on accepted, 401/429 on rejected (Mercantil won't retry on 200).
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminSupabase();
  const ip = getClientIP(request.headers);
  let rawPayload: Record<string, unknown> | null = null;

  try {
    // 1. Rate limit per IP (lightweight protection against replay/spam)
    const rl = checkRateLimit(`mercantil-wh:${ip}`, 100, 60_000);
    if (!rl.allowed) {
      console.warn(`[Mercantil Webhook] rate-limited ip=${ip}`);
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    // 2. Optional IP allowlist (opt-in via env var to avoid breaking sandbox callbacks)
    const allowedIps = (process.env.MERCANTIL_WEBHOOK_ALLOWED_IPS || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    if (allowedIps.length > 0 && !allowedIps.includes(ip)) {
      console.warn(`[Mercantil Webhook] ip not allowlisted ip=${ip}`);
      // Log for audit but reject with generic 401
      await supabase.from("payment_webhook_logs").insert({
        raw_payload: { blocked: true, ip },
        received_at: new Date().toISOString(),
        processing_error: `IP ${ip} not in allowlist`,
      });
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    rawPayload = await request.json();

    // Log raw webhook (includes source ip for audit)
    await supabase.from("payment_webhook_logs").insert({
      raw_payload: { ...rawPayload, _source_ip: ip },
      received_at: new Date().toISOString(),
    });

    const sdk = new MercantilSDK();
    if (!sdk.isConfigured) {
      console.warn("[Mercantil Webhook] SDK no configurado");
      return NextResponse.json({ received: true, configured: false }, { status: 200 });
    }

    // 3. Require encrypted `transactionData`. Plain-JSON payloads are rejected
    //    because without decryption there's no authenticity guarantee.
    if (!rawPayload || typeof rawPayload.transactionData !== "string" || !rawPayload.transactionData) {
      console.warn(`[Mercantil Webhook] missing transactionData ip=${ip}`);
      await supabase
        .from("payment_webhook_logs")
        .update({ processing_error: "Missing encrypted transactionData" })
        .eq("raw_payload", rawPayload);
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    // This will throw if no secret key can decrypt — which means the sender is not Mercantil.
    const payload = sdk.parseWebhook(rawPayload as Record<string, unknown>);

    console.log(
      `[Mercantil Webhook] Status: ${payload.status} | Invoice: ${payload.invoice_number} | Ref: ${payload.reference_number}`
    );

    // 4. integratorId check (best-effort — only if present in decrypted raw)
    const expectedIntegratorId = process.env.MERCANTIL_INTEGRATOR_ID;
    const raw = payload.raw as Record<string, unknown> | undefined;
    const merchantIdentify = raw?.merchant_identify as { integratorId?: string } | undefined;
    const receivedIntegratorId = merchantIdentify?.integratorId;
    if (expectedIntegratorId && receivedIntegratorId && receivedIntegratorId !== expectedIntegratorId) {
      console.warn(
        `[Mercantil Webhook] integratorId mismatch expected=${expectedIntegratorId} got=${receivedIntegratorId}`
      );
      await supabase
        .from("payment_webhook_logs")
        .update({ processing_error: "integratorId mismatch" })
        .eq("raw_payload", rawPayload);
      return NextResponse.json({ error: "integrator_mismatch" }, { status: 401 });
    }

    // 5. Timestamp freshness — reject events older than 15 min (replay window)
    if (payload.transaction_date) {
      const eventTime = new Date(payload.transaction_date).getTime();
      if (!Number.isNaN(eventTime)) {
        const ageMs = Date.now() - eventTime;
        if (ageMs > 15 * 60_000) {
          console.warn(`[Mercantil Webhook] stale event age_ms=${ageMs} ref=${payload.reference_number}`);
          await supabase
            .from("payment_webhook_logs")
            .update({ processing_error: `Stale event (age ${Math.round(ageMs / 1000)}s)` })
            .eq("raw_payload", rawPayload);
          return NextResponse.json({ error: "stale_event" }, { status: 400 });
        }
      }
    }

    // 6. Idempotency — skip if we've already processed this reference_number
    if (payload.reference_number) {
      const { data: prior } = await supabase
        .from("payment_webhook_logs")
        .select("id")
        .eq("reference_number", payload.reference_number)
        .eq("processed", true)
        .limit(1);
      if (prior && prior.length > 0) {
        console.log(`[Mercantil Webhook] duplicate ref=${payload.reference_number} — skipping`);
        return NextResponse.json(
          { received: true, duplicate: true, reference: payload.reference_number },
          { status: 200 }
        );
      }
    }

    // Update webhook log with parsed data
    await supabase
      .from("payment_webhook_logs")
      .update({
        invoice_number: payload.invoice_number,
        status: payload.status,
        payment_method: payload.payment_method,
        reference_number: payload.reference_number,
        amount: payload.amount,
        processed: true,
      })
      .eq("raw_payload", rawPayload);

    // Find the payment by invoice_number from metadata
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .filter("metadata->>invoice_number", "eq", payload.invoice_number)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    const payment = payments?.[0];

    if (!payment) {
      console.warn(
        `[Mercantil Webhook] No pending payment found for invoice ${payload.invoice_number}`
      );
      return NextResponse.json({ received: true, matched: false }, { status: 200 });
    }

    const statusMap: Record<string, string> = {
      approved: "confirmed",
      declined: "rejected",
      error: "rejected",
      pending: "pending",
    };
    const newStatus = statusMap[payload.status] || "pending";

    await supabase
      .from("payments")
      .update({
        status: newStatus,
        reference_number: payload.reference_number,
        authorization_code: payload.authorization_code || null,
        gateway_reference: payload.reference_number,
        gateway_response: payload as unknown as Record<string, unknown>,
        payment_method_name: payload.payment_method,
        completed_at: payload.status === "approved" ? new Date().toISOString() : null,
        confirmed_at: payload.status === "approved" ? new Date().toISOString() : null,
        error_message:
          payload.status === "declined" || payload.status === "error"
            ? payload.message
            : null,
      })
      .eq("id", payment.id);

    await supabase
      .from("payment_attempts")
      .update({
        status: payload.status,
        reference_number: payload.reference_number,
        authorization_code: payload.authorization_code || null,
        response_payload: payload as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
      })
      .eq("payment_token", payment.payment_token)
      .eq("status", "initiated");

    // --- Cross-reference with collection_items (cobros masivos) ---
    if (payload.status === "approved" && payload.invoice_number) {
      try {
        const { data: collectionItem } = await supabase
          .from("collection_items")
          .select("id, payment_token, campaign_id, amount_usd")
          .or(`invoice_number.eq.${payload.invoice_number},payment_token.eq.${payload.invoice_number}`)
          .in("status", ["pending", "sent", "viewed"])
          .limit(1)
          .single();

        if (collectionItem) {
          await markItemPaid(collectionItem.payment_token, {
            payment_method: "debito_inmediato",
            payment_reference: payload.reference_number || "",
            amount_bss: payload.amount ? parseFloat(String(payload.amount)) : undefined,
          });
          console.log("[Mercantil Webhook] Collection item marked as paid");
        }
      } catch {
        // Not finding a collection item is normal — not all Mercantil payments are from cobranzas
      }
    }

    return NextResponse.json(
      { received: true, matched: true, status: newStatus },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Mercantil Webhook] Processing error:", error);
    if (rawPayload) {
      await supabase
        .from("payment_webhook_logs")
        .update({
          processing_error: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("raw_payload", rawPayload);
    }
    // 200 keeps Mercantil from retrying on our internal errors.
    return NextResponse.json({ received: true, error: true }, { status: 200 });
  }
}
