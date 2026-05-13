// POST /api/cobranzas/[token]/mercantil-callback-failure
//
// MEJORA #3 — Detección activa de fallos del Botón Web Mercantil.
//
// Cuando Mercantil rechaza un pago (4025 intra-bank, fondos insuficientes,
// etc) NO envía webhook al comercio. El cliente es redirigido con error
// codes en la URL pero hoy el sistema espera al cron de abandonos (60min)
// para crear el caso. Esta ruta cierra el gap: el portal la llama
// inmediatamente cuando detecta query params de error en el callback.
//
// PÚBLICA (cliente la dispara desde el browser sin sesión). Protecciones:
//  - Rate limit 5/min por IP+token
//  - Guard atómico .neq("status","paid") — un decline tardío NO sobreescribe pago real
//  - Idempotente: si ya está failed, devuelve current state sin duplicar caso
//
// Body: { errorCode?: string, message?: string, paymentReference?: string }
//
// Mapeo errorCode → failureType:
//   4025 → intra_bank_limit (DBI Mercantil→Mercantil sin habilitar, antes del fix 2026-05-11)
//   otros conocidos → gateway_error con detalle del code en el caso

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { getItemsByToken } from "@/lib/dal/collection-campaigns";
import { createAdminSupabase } from "@/lib/supabase/server";
import { checkRateLimit, getClientIP } from "@/lib/utils/rate-limit";
import { createPaymentFailureCase } from "@/lib/cobranzas/payment-failure-case";
import { logGatewayEvent, classifyError } from "@/lib/dal/payment-gateway-logs";

interface CallbackFailureBody {
  errorCode?: string;
  message?: string;
  paymentReference?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    if (!token) return apiError("Falta token", 400);

    const ip = getClientIP(request.headers);
    const rl = checkRateLimit(`callback-fail:${ip}:${token}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }

    let body: CallbackFailureBody = {};
    try { body = await request.json(); } catch { /* body vacio OK */ }

    const item = await getItemsByToken(token);
    if (!item) return apiError("Enlace no encontrado", 404);

    // Idempotencia: si ya está en estado terminal, no hacer nada
    if (item.status === "paid") {
      return apiSuccess({
        already: "paid",
        status: item.status,
        message: "El pago ya fue confirmado, ignorando callback de error",
      });
    }
    if (item.status === "failed") {
      return apiSuccess({
        already: "failed",
        status: item.status,
        message: "Item ya marcado como failed previamente",
      });
    }
    if (!["pending", "sent", "viewed"].includes(item.status)) {
      return apiError(`Item en estado ${item.status} no aplica`, 409);
    }

    const errorCode = (body.errorCode || "").trim();
    const message = (body.message || "").trim();
    const paymentReference = (body.paymentReference || "").trim();

    // Mapeo errorCode → failureType. classifyError ya conoce los códigos
    // Mercantil más comunes; lo reusamos para evitar duplicar la lógica.
    const errCat = classifyError("mercantil", errorCode || null, message || null);
    const failureType: "intra_bank_limit" | "insufficient_funds" | "invalid_credentials" | "gateway_error" =
      errCat === "intra_bank_limit" ? "intra_bank_limit" :
      errCat === "insufficient_funds" ? "insufficient_funds" :
      errCat === "invalid_credentials" ? "invalid_credentials" :
      "gateway_error";

    // UPDATE atómico con guard — un decline tardío NO debe sobreescribir un
    // pago exitoso que se haya marcado entre el callback y este request.
    const sb = createAdminSupabase();
    const { data: updated, error: updErr } = await sb
      .from("collection_items")
      .update({
        status: "failed",
        ...(paymentReference && !item.payment_reference
          ? { payment_reference: paymentReference }
          : {}),
      })
      .eq("id", item.id)
      .neq("status", "paid")
      .neq("status", "failed")
      .select()
      .maybeSingle();

    if (updErr) {
      console.error("[CallbackFailure] Error UPDATE:", updErr);
      return apiServerError(updErr);
    }
    if (!updated) {
      // Race: alguien marcó paid/failed entre el read y el update
      return apiSuccess({
        already: "race_terminal",
        message: "Otro proceso marcó el item antes (paid o failed)",
      });
    }

    // Log webhook-equivalent — para que el dashboard de pasarelas vea el evento
    logGatewayEvent({
      collectionItemId: item.id, paymentToken: item.payment_token,
      gateway: "mercantil", gatewayProduct: "web_button",
      eventType: "error", outcome: "error",
      response: {
        source: "client_callback_url",
        event_subtype: "callback_received",
        errorCode: errorCode || null,
        errorMessage: message || null,
      },
      responseCode: errorCode || null,
      responseMessage: message || null,
      errorCategory: errCat,
      ip,
      customerCedulaRif: item.customer_cedula_rif,
      customerName: item.customer_name,
      amountUsd: Number(item.amount_usd),
    }).catch(() => {});

    // Auto-ticket en kanban
    createPaymentFailureCase({
      collectionItemId: item.id,
      gateway: "mercantil",
      gatewayProduct: "web_button",
      failureType,
      errorCode: errorCode || null,
      errorMessage: message || "Cliente regresó al portal con error en URL — sin webhook posterior",
    }).catch((err) =>
      console.error("[CallbackFailure] createPaymentFailureCase fallo:", err)
    );

    return apiSuccess({
      status: "failed",
      previous_status: item.status,
      error_code: errorCode || null,
      failure_type: failureType,
      message: "Falla detectada activamente desde callback del cliente",
    });
  } catch (err) {
    return apiServerError(err);
  }
}
