// ============================================================
// WhatsApp Notifications — Meta Business API
// Phone Number ID: 506922512512507
// ============================================================

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "506922512512507";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const API_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// Language code for approved templates — try "es" first, common alternatives: "es_ES", "es_MX", "es_AR"
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || "es";

// ---------- Types ----------

type TemplateName =
  | "cobranza_pago_pendiente"
  | "recordatorio_pago_48h"
  | "recordatorio_pago_urgente"
  | "pago_confirmado";

interface TemplateComponent {
  type: "body";
  parameters: Array<{ type: "text"; text: string }>;
}

export interface WhatsAppResult {
  ok: boolean;
  status: number;
  phone: string;
  normalizedPhone: string;
  template: string;
  lang: string;
  phoneNumberId: string;
  response: Record<string, unknown>;
  fallback?: { ok: boolean; status: number; response: Record<string, unknown> };
}

// ---------- Phone normalization ----------

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");

  // Venezuelan local format "0412..." → international "58412..."
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "58" + digits.slice(1);
  }

  // If still doesn't start with country code, assume Venezuela
  if (!digits.startsWith("58") && digits.length === 10) {
    digits = "58" + digits;
  }

  return digits; // Meta expects digits only, no + prefix
}

// ---------- API call ----------

async function callMetaAPI(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({ _parseError: true }));
  return { ok: res.ok, status: res.status, body };
}

async function sendWhatsApp(
  phone: string,
  templateName: TemplateName,
  components: TemplateComponent[],
  fallbackText: string
): Promise<WhatsAppResult> {
  const result: WhatsAppResult = {
    ok: false,
    status: 0,
    phone: "",
    normalizedPhone: phone,
    template: templateName,
    lang: TEMPLATE_LANG,
    phoneNumberId: PHONE_NUMBER_ID,
    response: {},
  };

  // ── 1. Try template message ──
  const templatePayload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: TEMPLATE_LANG },
      components,
    },
  };

  const res = await callMetaAPI(templatePayload);
  result.status = res.status;
  result.response = res.body;
  result.ok = res.ok;

  if (res.ok) return result;

  // ── 2. Template failed — check if we should fallback to text ──
  const errCode = res.body?.error && (res.body.error as Record<string, unknown>).code;

  const templateErrors = [132000, 132001, 132005, 132007, 132012, 132015];
  if (templateErrors.includes(Number(errCode))) {
    const textPayload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: fallbackText },
    };

    const fbRes = await callMetaAPI(textPayload);
    result.fallback = { ok: fbRes.ok, status: fbRes.status, response: fbRes.body };
    result.ok = fbRes.ok;

    if (!fbRes.ok) {
      throw new Error(`WhatsApp text fallback failed ${fbRes.status}: ${JSON.stringify(fbRes.body)}`);
    }
    return result;
  }

  // Non-template error — throw but still include result
  throw new Error(`WhatsApp API error ${res.status}: ${JSON.stringify(res.body)}`);
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

export async function sendCollectionWhatsApp(params: SendCollectionWhatsAppParams): Promise<WhatsAppResult> {
  const { phone, customerName, amountUsd, concept, paymentUrl, reminderType } = params;

  if (!ACCESS_TOKEN) {
    return {
      ok: false, status: 0, phone, normalizedPhone: "",
      template: "", lang: TEMPLATE_LANG, phoneNumberId: PHONE_NUMBER_ID,
      response: { _skip: "WHATSAPP_ACCESS_TOKEN is empty" },
    };
  }

  const normalizedPhone = normalizePhone(phone);
  const montoStr = `$${amountUsd.toFixed(2)} USD`;

  let templateName: TemplateName;
  let components: TemplateComponent[];
  let fallbackText: string;

  switch (reminderType) {
    case "48h":
      templateName = "recordatorio_pago_48h";
      components = [{
        type: "body",
        parameters: [
          { type: "text", text: customerName },
          { type: "text", text: montoStr },
          { type: "text", text: paymentUrl },
        ],
      }];
      fallbackText =
        `Recordatorio de pago — WUIPI Telecomunicaciones\n\n` +
        `Hola ${customerName},\n\n` +
        `Tienes un cobro pendiente de ${montoStr}.\n` +
        `La fecha de corte de servicio es el día 8 de cada mes.\n\n` +
        `Paga fácil y rápido:\n${paymentUrl}\n\n` +
        `Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.`;
      break;

    case "urgent":
      templateName = "recordatorio_pago_urgente";
      components = [{
        type: "body",
        parameters: [
          { type: "text", text: customerName },
          { type: "text", text: montoStr },
          { type: "text", text: paymentUrl },
        ],
      }];
      fallbackText =
        `Último aviso de pago — WUIPI Telecomunicaciones\n\n` +
        `Hola ${customerName},\n\n` +
        `Tu pago de ${montoStr} sigue pendiente y la fecha de corte (día 8) está muy próxima.\n` +
        `Para evitar la suspensión de tu servicio, realiza tu pago cuanto antes:\n` +
        `${paymentUrl}\n\n` +
        `Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.`;
      break;

    default:
      templateName = "cobranza_pago_pendiente";
      components = [{
        type: "body",
        parameters: [
          { type: "text", text: customerName },
          { type: "text", text: concept },
          { type: "text", text: montoStr },
          { type: "text", text: paymentUrl },
        ],
      }];
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

  const result = await sendWhatsApp(normalizedPhone, templateName, components, fallbackText);
  result.phone = phone;
  return result;
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

  const components: TemplateComponent[] = [{
    type: "body",
    parameters: [
      { type: "text", text: params.customerName },
      { type: "text", text: params.concept },
      { type: "text", text: params.amount },
      { type: "text", text: params.reference },
    ],
  }];

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

  await sendWhatsApp(normalizedPhone, "pago_confirmado", components, fallbackText);
}
