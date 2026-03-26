// ============================================================
// WhatsApp Notifications — Meta Business API
// Phone Number ID: 506922512512507
// Plantillas aprobadas de Meta para cobranzas
// ============================================================

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "506922512512507";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const API_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// ---------- Templates ----------

type TemplateName =
  | "cobranza_pago_pendiente"
  | "recordatorio_pago_48h"
  | "recordatorio_pago_urgente"
  | "pago_confirmado";

interface TemplateComponent {
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}

function buildTemplatePayload(
  phone: string,
  templateName: TemplateName,
  components: TemplateComponent[]
) {
  return {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "es" },
      components,
    },
  };
}

function buildTextFallback(phone: string, text: string) {
  return {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text },
  };
}

// ---------- Phone normalization ----------

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "58" + cleaned.slice(1);
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned.replace("+", ""); // WhatsApp API expects no + prefix
}

// ---------- API call with template→text fallback ----------

async function sendWhatsApp(body: Record<string, unknown>, fallbackText?: string): Promise<void> {
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
    const errorCode = errData?.error?.code;

    // Template not approved or not found — fallback to text (only works within 24h window)
    if (fallbackText && (errorCode === 132015 || errorCode === 132001 || errorCode === 132000)) {
      console.warn(`[WhatsApp] Template not approved, falling back to text message`);
      const fallbackBody = buildTextFallback(body.to as string, fallbackText);
      const fallbackRes = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fallbackBody),
      });
      if (!fallbackRes.ok) {
        const fbErr = await fallbackRes.json().catch(() => ({}));
        throw new Error(
          `WhatsApp API error ${fallbackRes.status} (fallback): ${JSON.stringify(fbErr)}`
        );
      }
      return;
    }

    throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(errData)}`);
  }
}

// ---------- Public API ----------

export interface SendCollectionWhatsAppParams {
  phone: string;
  customerName: string;
  amountUsd: number;
  concept: string;
  paymentUrl: string;
  reminderType?: "initial" | "48h" | "urgent";
}

export async function sendCollectionWhatsApp(params: SendCollectionWhatsAppParams): Promise<void> {
  const { phone, customerName, amountUsd, concept, paymentUrl, reminderType } = params;

  if (!ACCESS_TOKEN) {
    console.warn("[WhatsApp] ACCESS_TOKEN not configured, skipping send");
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const montoStr = `$${amountUsd.toFixed(2)} USD`;

  // Determine which template to use
  let templateName: TemplateName;
  let components: TemplateComponent[];
  let fallbackText: string;

  switch (reminderType) {
    case "48h":
      // 1er y 2do recordatorio
      templateName = "recordatorio_pago_48h";
      components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: montoStr },
            { type: "text", text: paymentUrl },
          ],
        },
      ];
      fallbackText =
        `Recordatorio de pago — WUIPI Telecomunicaciones\n\n` +
        `Hola ${customerName},\n\n` +
        `Tienes un cobro pendiente de ${montoStr}.\n` +
        `La fecha de corte de servicio es el día 8 de cada mes.\n\n` +
        `Paga fácil y rápido:\n${paymentUrl}\n\n` +
        `Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.`;
      break;

    case "urgent":
      // 3er recordatorio — último aviso
      templateName = "recordatorio_pago_urgente";
      components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: montoStr },
            { type: "text", text: paymentUrl },
          ],
        },
      ];
      fallbackText =
        `Último aviso de pago — WUIPI Telecomunicaciones\n\n` +
        `Hola ${customerName},\n\n` +
        `Tu pago de ${montoStr} sigue pendiente y la fecha de corte (día 8) está muy próxima.\n` +
        `Para evitar la suspensión de tu servicio, realiza tu pago cuanto antes:\n` +
        `${paymentUrl}\n\n` +
        `Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.`;
      break;

    default:
      // Envío inicial
      templateName = "cobranza_pago_pendiente";
      components = [
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: concept },
            { type: "text", text: montoStr },
            { type: "text", text: paymentUrl },
          ],
        },
      ];
      fallbackText =
        `Nuevo cobro — WUIPI Telecomunicaciones\n\n` +
        `Hola ${customerName},\n\n` +
        `Tienes un cobro pendiente:\n` +
        `Concepto: ${concept}\n` +
        `Monto: ${montoStr}\n\n` +
        `La fecha de corte es el día 8 de cada mes.\n` +
        `Paga fácil y rápido desde tu celular:\n${paymentUrl}\n\n` +
        `Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.`;
      break;
  }

  const body = buildTemplatePayload(normalizedPhone, templateName, components);
  await sendWhatsApp(body, fallbackText);
}

export async function sendPaymentConfirmationWhatsApp(params: {
  phone: string;
  customerName: string;
  reference: string;
  amount: string;
  concept: string;
}): Promise<void> {
  if (!ACCESS_TOKEN) return;

  const normalizedPhone = normalizePhone(params.phone);

  // Template: pago_confirmado (nombre, concepto, monto, referencia)
  const body = buildTemplatePayload(normalizedPhone, "pago_confirmado", [
    {
      type: "body",
      parameters: [
        { type: "text", text: params.customerName },
        { type: "text", text: params.concept },
        { type: "text", text: params.amount },
        { type: "text", text: params.reference },
      ],
    },
  ]);

  const fallbackText =
    `Pago recibido — WUIPI Telecomunicaciones\n\n` +
    `Hola ${params.customerName},\n\n` +
    `Hemos recibido tu pago correctamente.\n` +
    `Concepto: ${params.concept}\n` +
    `Referencia: ${params.reference}\n` +
    `Monto: ${params.amount}\n\n` +
    `Ya no es necesaria ninguna acción de tu parte. ` +
    `El registro del pago puede tomar algunas horas, pero tu servicio ya está asegurado.\n\n` +
    `Gracias por tu pago.`;

  await sendWhatsApp(body, fallbackText);
}
