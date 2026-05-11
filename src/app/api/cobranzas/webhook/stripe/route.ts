// POST /api/cobranzas/webhook/stripe — Webhook de Stripe
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid, getItemsByToken } from "@/lib/dal/collection-campaigns";
import { sendPaymentConfirmationWhatsApp } from "@/lib/notifications/whatsapp";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { logGatewayEvent } from "@/lib/dal/payment-gateway-logs";
import { createPaymentFailureCase, closeOpenCasesForPaidItem } from "@/lib/cobranzas/payment-failure-case";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    console.error("[Stripe Webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // constructEvent validates signature + timestamp (rejects events > 5min old by default)
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    logGatewayEvent({
      gateway: "stripe", gatewayProduct: "webhook",
      eventType: "error", outcome: "error",
      responseMessage: "Invalid signature: " + (err instanceof Error ? err.message : "unknown"),
      errorCategory: "invalid_credentials",
    }).catch(() => {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const token = session.metadata?.collection_token;

    // La cuenta Stripe es compartida con otras apps (MiloApp, suscripciones
    // del negocio, etc.). Stripe transmite checkout.session.completed a TODOS
    // los endpoints suscritos — no podemos filtrar por app en el lado Stripe.
    // Si no hay collection_token en metadata, el evento no es del portal WUIPI:
    // acknowledgemos 200 y salimos sin contaminar logs ni DB.
    if (!token) {
      console.info(
        `[Stripe Webhook] Skipping non-WUIPI event ${event.id} (no collection_token, session=${session.id})`
      );
      return NextResponse.json({ received: true });
    }

    try {
      const item = await getItemsByToken(token);

      // Idempotency: skip if already paid
      if (item?.status === "paid") {
        console.warn("[Stripe Webhook] Item already paid, skipping:", token);
        return NextResponse.json({ received: true });
      }

      // Verify amount matches (tolerance $0.01)
      if (item && session.amount_total) {
        const expectedCents = Math.round(Number(item.amount_usd) * 100);
        if (Math.abs(session.amount_total - expectedCents) > 1) {
          console.error("[Stripe Webhook] AMOUNT MISMATCH detected — payment NOT marked as paid");
          // Auto-ticket en kanban: monto no coincide
          createPaymentFailureCase({
            collectionItemId: item.id,
            gateway: "stripe",
            gatewayProduct: "checkout_session",
            failureType: "amount_mismatch",
            errorMessage: `Expected $${expectedCents/100}, got $${session.amount_total/100}`,
          }).catch(err =>
            console.error("[Stripe Webhook] createPaymentFailureCase fallo:", err)
          );
          return NextResponse.json({ received: true }); // Acknowledge but don't mark paid
        }
      }

      await markItemPaid(token, {
        payment_method: "stripe",
        payment_reference: session.payment_intent as string || session.id,
      });

      // Log: pago Stripe completado
      if (item) {
        logGatewayEvent({
          collectionItemId: item.id, paymentToken: item.payment_token,
          gateway: "stripe", gatewayProduct: "checkout_session",
          eventType: "webhook_received", outcome: "success",
          response: {
            session_id: session.id,
            payment_intent_id: (session.payment_intent as string) || null,
            status: session.payment_status || null,
          },
          customerCedulaRif: item.customer_cedula_rif,
          customerName: item.customer_name,
          amountUsd: Number(item.amount_usd),
        }).catch(() => {});

        // Cerrar casos abiertos en kanban (cliente pago via tarjeta tras
        // intentos previos fallidos)
        closeOpenCasesForPaidItem(item.id).catch(err =>
          console.error("[Stripe Webhook] closeOpenCasesForPaidItem fallo:", err)
        );
      }

      // Sprint 4 — sync Odoo via waitUntil (factura queda en USD).
      if (item) {
        try {
          const ref = (session.payment_intent as string) || session.id;
          const { waitUntil } = await import("@vercel/functions");
          const { triggerOdooSyncOrEnqueue } = await import("@/lib/integrations/odoo-sync-trigger");
          const itemMeta = (item.metadata as Record<string, unknown> | null) || null;
          const odooInvoiceIds = Array.isArray(itemMeta?.odoo_invoice_ids)
            ? (itemMeta!.odoo_invoice_ids as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0)
            : null;
          waitUntil(
            triggerOdooSyncOrEnqueue({
              collectionItemId: item.id,
              paymentToken: item.payment_token,
              customerCedulaRif: item.customer_cedula_rif,
              customerEmail: item.customer_email,
              paymentMethod: "stripe",
              paymentReference: ref,
              amountUsd: Number(item.amount_usd),
              amountVes: null,
              odooInvoiceIds,
            }).catch((err) => console.error("[Stripe Webhook] Sync Odoo fallo:", err))
          );
        } catch (err) {
          console.error("[Stripe Webhook] Sync Odoo setup fallo:", err);
        }
      }

      // Send payment confirmation notifications
      if (item) {
        const reference = (session.payment_intent as string) || session.id;
        const amount = `$${Number(item.amount_usd).toFixed(2)} USD`;
        const concept = item.concept || "Servicio WUIPI";

        if (item.customer_phone) {
          sendPaymentConfirmationWhatsApp({
            phone: item.customer_phone,
            customerName: item.customer_name,
            reference,
            amount,
            concept,
          }).catch((err) => console.error("[Stripe Webhook] WA confirmation error:", err));
        }

        if (item.customer_email) {
          sendPaymentConfirmationEmail({
            email: item.customer_email,
            customerName: item.customer_name,
            reference,
            amount,
            concept,
          }).catch((err) => console.error("[Stripe Webhook] Email confirmation error:", err));
        }
      }
    } catch (err) {
      console.error("[Stripe Webhook] Error processing payment:", err);
    }
  }

  return NextResponse.json({ received: true });
}
