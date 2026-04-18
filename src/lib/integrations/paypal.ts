// ============================================================
// PayPal REST API Integration
// Docs: https://developer.paypal.com/docs/api/orders/v2/
// ============================================================

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const PAYPAL_MODE = process.env.PAYPAL_MODE || "sandbox";

const BASE_URL = PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

export function isPayPalConfigured(): boolean {
  return !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PayPal auth error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function createPayPalOrder(params: {
  amountUsd: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  customId: string; // collection_token
}): Promise<{ orderId: string; approveUrl: string }> {
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: params.amountUsd.toFixed(2),
        },
        description: params.description,
        custom_id: params.customId,
      }],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        brand_name: "WUIPI Telecomunicaciones",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        landing_page: "LOGIN",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PayPal create order error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const approveLink = data.links?.find((l: { rel: string; href: string }) => l.rel === "approve");

  return {
    orderId: data.id,
    approveUrl: approveLink?.href || "",
  };
}

/**
 * Verifies a PayPal webhook signature via PayPal's official verification endpoint.
 * Docs: https://developer.paypal.com/api/rest/webhooks/rest/#verify-webhook-signature
 *
 * Requires env var PAYPAL_WEBHOOK_ID (configure in PayPal dashboard when subscribing).
 *
 * Returns { verified: true } on success, or { verified: false, reason } otherwise.
 * Caller MUST reject on verified=false — unsigned webhook = untrusted source.
 */
export async function verifyPayPalWebhook(params: {
  headers: Headers;
  rawBody: string;
}): Promise<{ verified: boolean; reason?: string }> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    return { verified: false, reason: "PAYPAL_WEBHOOK_ID not configured" };
  }

  // PayPal sends these headers; all required for verification
  const get = (name: string) => params.headers.get(name) || "";
  const transmissionId = get("paypal-transmission-id");
  const transmissionTime = get("paypal-transmission-time");
  const transmissionSig = get("paypal-transmission-sig");
  const certUrl = get("paypal-cert-url");
  const authAlgo = get("paypal-auth-algo");

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return { verified: false, reason: "Missing PayPal signature headers" };
  }

  // Only accept cert_url from PayPal domains — prevents attacker from hosting
  // their own cert that technically "verifies" a forged signature.
  try {
    const u = new URL(certUrl);
    if (!u.hostname.endsWith(".paypal.com")) {
      return { verified: false, reason: "cert_url not from paypal.com" };
    }
  } catch {
    return { verified: false, reason: "Invalid cert_url" };
  }

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(params.rawBody);
  } catch {
    return { verified: false, reason: "Invalid JSON body" };
  }

  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    }),
  });

  if (!res.ok) {
    return { verified: false, reason: `verify call HTTP ${res.status}` };
  }
  const data = await res.json().catch(() => ({}));
  if (data.verification_status === "SUCCESS") return { verified: true };
  return { verified: false, reason: `verification_status=${data.verification_status}` };
}

export async function capturePayPalOrder(orderId: string): Promise<{
  status: string;
  captureId: string;
  customId: string;
  amount: string;
}> {
  const token = await getAccessToken();

  console.log(`[PayPal] Capturing order: ${orderId} via ${BASE_URL}`);
  const res = await fetch(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json().catch(() => ({}));
  console.log(`[PayPal] Capture response status=${res.status}:`, JSON.stringify(data));

  if (!res.ok) {
    throw new Error(`PayPal capture error ${res.status}: ${JSON.stringify(data)}`);
  }

  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  const customId = data.purchase_units?.[0]?.custom_id ||
    data.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || "";

  return {
    status: data.status,
    captureId: capture?.id || data.id,
    customId,
    amount: capture?.amount?.value || "0",
  };
}
