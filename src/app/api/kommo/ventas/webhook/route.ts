// ===========================================
// Kommo Ventas Webhook — Sales Bot Receiver
// Solo loguea el payload por ahora (Fase 1)
// ===========================================

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let payload: any;

    // Kommo puede enviar como JSON o como form-urlencoded
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      // Intentar JSON por defecto
      const text = await request.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }

    // Log completo del evento para análisis
    console.log("[Kommo Webhook] ===== EVENTO RECIBIDO =====");
    console.log("[Kommo Webhook] Content-Type:", contentType);
    console.log("[Kommo Webhook] Headers:", JSON.stringify({
      "x-forwarded-for": request.headers.get("x-forwarded-for"),
      "user-agent": request.headers.get("user-agent"),
    }));
    console.log("[Kommo Webhook] Payload:", JSON.stringify(payload, null, 2));
    console.log("[Kommo Webhook] ===========================");

    // Kommo espera 200 OK — si no lo recibe, reintenta
    return NextResponse.json({ status: "received" });
  } catch (error: any) {
    console.error("[Kommo Webhook] Error procesando evento:", error);
    // Siempre devolver 200 para que Kommo no reintente en caso de error nuestro
    return NextResponse.json({ status: "error", message: error.message });
  }
}
