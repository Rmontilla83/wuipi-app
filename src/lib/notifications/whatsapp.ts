// ============================================================
// WhatsApp Notifications — Meta Business API
// Phone Number ID: 506922512512507
// ============================================================

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "506922512512507";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const API_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

interface SendWhatsAppParams {
  phone: string;
  customerName: string;
  amountUsd: number;
  concept: string;
  paymentUrl: string;
  isReminder?: boolean;
}

function normalizePhone(phone: string): string {
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, "");
  // Ensure country code (Venezuela +58)
  if (cleaned.startsWith("0")) {
    cleaned = "58" + cleaned.slice(1);
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned.replace("+", ""); // WhatsApp API expects no + prefix
}

export async function sendCollectionWhatsApp(params: SendWhatsAppParams): Promise<void> {
  const { phone, customerName, amountUsd, concept, paymentUrl, isReminder } = params;

  if (!ACCESS_TOKEN) {
    console.warn("[WhatsApp] ACCESS_TOKEN not configured, skipping send");
    return;
  }

  const normalizedPhone = normalizePhone(phone);

  // Try template first, fallback to text message
  const greeting = isReminder ? "Recordatorio de pago" : "Nuevo cobro";
  const body = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "text",
    text: {
      body:
        `${greeting} — WUIPI Telecomunicaciones\n\n` +
        `Hola ${customerName},\n\n` +
        `Tienes un cobro pendiente:\n` +
        `📋 Concepto: ${concept}\n` +
        `💰 Monto: $${amountUsd.toFixed(2)} USD\n\n` +
        `Paga fácil y rápido desde tu celular:\n` +
        `${paymentUrl}\n\n` +
        `Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.`,
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      `WhatsApp API error ${res.status}: ${JSON.stringify(errData)}`
    );
  }
}

export async function sendPaymentConfirmationWhatsApp(params: {
  phone: string;
  customerName: string;
  reference: string;
  amount: string;
}): Promise<void> {
  if (!ACCESS_TOKEN) return;

  const normalizedPhone = normalizePhone(params.phone);

  const body = {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "text",
    text: {
      body:
        `✅ ¡Pago recibido! — WUIPI Telecomunicaciones\n\n` +
        `Hola ${params.customerName},\n\n` +
        `Hemos recibido tu pago correctamente.\n` +
        `📝 Referencia: ${params.reference}\n` +
        `💰 Monto: ${params.amount}\n\n` +
        `¡Gracias por tu pago!`,
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    console.error("[WhatsApp] Confirmation send failed:", errData);
  }
}
