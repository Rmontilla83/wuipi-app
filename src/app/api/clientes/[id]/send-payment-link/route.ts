// POST /api/clientes/[id]/send-payment-link
//
// Envia el link de pago via WhatsApp al cliente. Usa el helper
// sendCobranzasWA que respeta COBRANZAS_WA_DRY_RUN — en dry-run el mensaje
// queda en cobranzas_wa_outbox sin llegar a Meta.
//
// Body:
//   {
//     template?: WATemplateName,    // default 'd3_recordatorio_suave'
//     phone?: string,               // override del telefono Odoo
//     totalDueLabel?: string        // override del monto (ej. "$25.00 USD")
//   }

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { sendCobranzasWA } from "@/lib/cobranzas/wa-cobranzas";
import { WA_TEMPLATES_COBRANZAS, type WATemplateName } from "@/lib/cobranzas/wa-templates";
import { generateClientPaymentToken } from "@/lib/utils/payment-token";
import { searchRead, isOdooConfigured } from "@/lib/integrations/odoo";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const caller = await requirePermission("cobranzas", "send");
    if (!caller) {
      const fallback = await requirePermission("cobranzas", "update");
      if (!fallback) return apiError("Sin permisos", 403);
    }

    const partnerId = parseInt(params.id, 10);
    if (!partnerId || partnerId <= 0) return apiError("partnerId invalido", 400);

    if (!isOdooConfigured()) {
      return apiError("Odoo no esta configurado", 503);
    }

    const body = await request.json().catch(() => ({}));
    const templateKey = (body.template || "d3_recordatorio_suave") as WATemplateName;

    if (!WA_TEMPLATES_COBRANZAS[templateKey]) {
      return apiError(`Template "${templateKey}" no existe`, 400);
    }

    // Lookup cliente en Odoo (nombre, telefono, deuda)
    const partners = await searchRead(
      "res.partner",
      [["id", "=", partnerId]],
      { fields: ["id", "name", "mobile", "phone", "total_due"], limit: 1 }
    );
    const partner = partners[0];
    if (!partner) return apiError("Cliente no encontrado en Odoo", 404);

    const phone = (body.phone || partner.mobile || partner.phone || "").toString().trim();
    if (!phone || phone.replace(/\D/g, "").length < 10) {
      return apiError("Cliente sin telefono valido en Odoo (campo mobile/phone)", 400);
    }

    const customerName = partner.name || "Cliente";
    const totalDueLabel = body.totalDueLabel || (
      Number(partner.total_due) > 0
        ? `Bs ${Number(partner.total_due).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "tu factura pendiente"
    );

    // Generar link permanente del cliente
    const token = generateClientPaymentToken(partnerId);
    const link = `${APP_URL}/pagar/cliente/${token}`;

    // Mapear params segun el template seleccionado.
    // Cada template usa diferente cantidad de variables:
    //   d3_recordatorio_suave: {{1}} nombre, {{2}} monto, {{3}} link
    //   d27_aviso_factura_generada: {{1}} nombre, {{2}} mes, {{3}} monto, {{4}} link
    //   payment_failure_apology: {{1}} nombre, {{2}} contexto, {{3}} link
    //   d1_recordatorio_inicio_mes: {{1}} nombre, {{2}} monto, {{3}} link
    //   d5_recordatorio_firme: {{1}} nombre, {{2}} monto, {{3}} link
    //   ...
    // Para templates con variables custom (D7/D15/etc) el caller debe pasar
    // los params explicitos.
    let waParams: Record<string, string>;
    if (body.params && typeof body.params === "object") {
      waParams = body.params as Record<string, string>;
    } else {
      // Auto-fill basado en patron mas comun (nombre, monto, link)
      switch (templateKey) {
        case "d27_aviso_factura_generada":
          waParams = {
            "1": customerName,
            "2": new Date().toLocaleString("es-VE", { month: "long", timeZone: "America/Caracas" }),
            "3": totalDueLabel,
            "4": link,
          };
          break;
        case "payment_failure_apology":
          waParams = {
            "1": customerName,
            "2": "(reintenta con otro metodo)",
            "3": link,
          };
          break;
        default:
          // Patron mas comun: 1 nombre, 2 monto, 3 link
          waParams = {
            "1": customerName,
            "2": totalDueLabel,
            "3": link,
          };
      }
    }

    const result = await sendCobranzasWA({
      phone,
      customerName,
      template: templateKey,
      params: waParams,
      triggerEvent: "manual_test",  // se puede agregar trigger nuevo "manual_send_link" si lo querermos distinguir
      // Acción manual del admin desde la tarjeta del cliente — siempre real,
      // independiente de COBRANZAS_WA_DRY_RUN. Sin esto el envío quedaba
      // como dry-run y el admin veía "Enviado" pero el cliente nunca recibía.
      forceLive: true,
    });

    return apiSuccess({
      ok: result.ok,
      outbox_id: result.outboxId,
      dry_run: result.dryRun,
      status: result.status,
      meta_message_id: result.metaMessageId,
      error: result.error,
      sent_to: phone,
      link,
    });
  } catch (err) {
    return apiServerError(err);
  }
}
