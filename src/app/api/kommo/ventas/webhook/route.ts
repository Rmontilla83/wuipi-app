// ===========================================
// Kommo Ventas Webhook — Sales Bot Receiver
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { parseWebhookPayload } from "@/lib/integrations/kommo-ventas";
import { handleIncomingMessage } from "@/lib/bot/sales-engine";
import type { BotIncomingMessage } from "@/lib/bot/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let raw: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        raw[key] = value.toString();
      }
    } else if (contentType.includes("application/json")) {
      raw = await request.json();
    } else {
      const text = await request.text();
      try { raw = JSON.parse(text); } catch { raw = { _raw: text }; }
    }

    const event = parseWebhookPayload(raw);

    // Ignorar mensajes salientes (del vendedor o del bot)
    if (event.message.type !== "incoming") {
      return NextResponse.json({ status: "ignored", reason: "outgoing" });
    }

    // Ignorar mensajes sin texto (media, stickers, etc.)
    if (!event.message.text.trim()) {
      return NextResponse.json({ status: "ignored", reason: "empty" });
    }

    console.log("[Kommo Bot]", JSON.stringify({
      action: "message_received",
      origin: event.message.origin,
      contact: event.message.author.name,
      leadId: event.message.elementId,
      text: event.message.text.slice(0, 200),
    }));

    // Construir mensaje para el motor del bot
    const msg: BotIncomingMessage = {
      messageId: event.message.id,
      chatId: event.message.chatId,
      talkId: event.message.talkId,
      contactId: event.message.contactId,
      leadId: event.message.elementId,
      text: event.message.text,
      authorName: event.message.author.name,
      authorType: event.message.author.type,
      origin: event.message.origin,
      createdAt: event.message.createdAt,
    };

    // Procesar con el motor del bot (no bloquear la respuesta a Kommo)
    // Usamos waitUntil pattern: respondemos 200 inmediato y procesamos en background
    const botPromise = handleIncomingMessage(msg).catch((err) => {
      console.error("[Kommo Bot] Error en motor:", err.message);
    });

    // En Vercel, el runtime mantiene la función viva hasta que las promises pendientes se resuelvan
    // siempre que respondamos dentro del timeout
    void botPromise;

    return NextResponse.json({ status: "processing" });
  } catch (error: any) {
    console.error("[Kommo Bot] Error:", error.message);
    return NextResponse.json({ status: "error", message: error.message });
  }
}
