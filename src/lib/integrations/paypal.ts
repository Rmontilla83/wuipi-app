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
