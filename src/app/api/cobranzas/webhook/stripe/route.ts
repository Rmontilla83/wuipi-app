// POST /api/cobranzas/webhook/stripe — Webhook de Stripe
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { markItemPaid } from "@/lib/dal/collection-campaigns";
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
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const token = session.metadata?.collection_token;

    if (token) {
      try {
        await markItemPaid(token, {
          payment_method: "stripe",
          payment_reference: session.payment_intent as string || session.id,
        });
      } catch (err) {
        console.error("[Stripe Webhook] Error marking item paid:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
