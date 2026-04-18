// ===========================================
// Kommo Ventas Webhook — Sales Bot Receiver
// Recibe triggers del Salesbot (send_hook)
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { handleSalesbotTrigger } from "@/lib/bot/sales-engine";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    // Cheap IP-level rate limit — bounds LLM cost if anyone floods the webhook.
    // Kommo legitimate traffic is low volume per origin.
    const ip = getClientIP(request.headers);
    const rlIp = checkRateLimit(`kommo-webhook:${ip}`, 60, 60_000);
    if (!rlIp.allowed) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    const contentType = request.headers.get("content-type") || "";
    let payload: Record<string, any> = {};

    // El Salesbot send_hook puede enviar como form-urlencoded o JSON
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        payload[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const text = await request.text();
      try { payload = JSON.parse(text); } catch { payload = { _raw: text }; }
    }

    // Extraer lead ID del payload del Salesbot
    // El trigger send_hook envía datos del lead en varios formatos posibles
    const leadId = extractLeadId(payload);

    if (!leadId) {
      console.log("[Kommo Bot] No se pudo extraer leadId del payload:", JSON.stringify(payload).slice(0, 500));
      return NextResponse.json({ status: "ignored", reason: "no_lead_id" });
    }

    // Per-lead rate limit — prevents abuse where the same lead triggers the bot
    // repeatedly (loop, adversarial spam). 10 triggers/min per lead is generous.
    const rlLead = checkRateLimit(`salesbot:${leadId}`, 10, 60_000);
    if (!rlLead.allowed) {
      console.log(`[Kommo Bot] rate-limited lead=${leadId}`);
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    console.log("[Kommo Bot] Trigger recibido para lead:", leadId);

    // Procesar con el motor del bot
    await handleSalesbotTrigger(leadId);

    return NextResponse.json({ status: "processed" });
  } catch (error: any) {
    console.error("[Kommo Bot] Error:", error.message);
    return NextResponse.json({ status: "error", message: error.message });
  }
}

/** Extraer el lead ID del payload del Salesbot trigger */
function extractLeadId(payload: Record<string, any>): number | null {
  // Formato 1: lead[id] (form-urlencoded del trigger)
  if (payload["lead[id]"]) return parseInt(payload["lead[id]"]);

  // Formato 2: leads[status][0][id] (webhook estándar de Kommo)
  if (payload["leads[status][0][id]"]) return parseInt(payload["leads[status][0][id]"]);

  // Formato 3: message[add][0][element_id] (webhook de mensaje)
  if (payload["message[add][0][element_id]"]) return parseInt(payload["message[add][0][element_id]"]);

  // Formato 4: JSON directo
  if (payload.lead_id) return parseInt(payload.lead_id);
  if (payload.lead?.id) return parseInt(payload.lead.id);

  // Formato 5: unsorted[add][0][lead_id]
  if (payload["unsorted[add][0][lead_id]"]) return parseInt(payload["unsorted[add][0][lead_id]"]);

  return null;
}
