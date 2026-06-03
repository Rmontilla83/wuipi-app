// GET /api/cobranzas/panel/transactions/[id]
//
// Detalle completo de una transacción: el item, su timeline, eventos de
// pasarela (payment_gateway_logs), webhooks crudos (payment_webhook_logs)
// y estado de sync a Odoo. Construye un diagnóstico humano para el fallo
// o el sync pendiente.

export const dynamic = "force-dynamic";

import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";
import { apiError, apiServerError, apiSuccess } from "@/lib/api-helpers";
import { translateGatewayError, translateSyncError } from "@/lib/cobranzas/error-translations";
import { hoursSince, formatRelative } from "@/lib/cobranzas/period-helpers";
import type { TxDetail, TimelineEvent } from "@/lib/cobranzas/types";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("No autorizado", 401);

    const id = params.id;
    if (!id || id.length < 8) return apiError("ID inválido", 400);

    const db = createAdminSupabase();

    const { data: item, error: itemErr } = await db
      .from("collection_items")
      .select(
        "id, paid_at, created_at, customer_name, customer_cedula_rif, customer_email, customer_phone, amount_usd, amount_bss, bcv_rate, payment_method, payment_reference, status, invoice_number, concept, metadata, expires_at, payment_token, odoo_sync_synced_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (itemErr) return apiServerError(itemErr);
    if (!item) return apiError("Transacción no encontrada", 404);

    const [gatewayRes, webhookRes, syncRes] = await Promise.all([
      db
        .from("payment_gateway_logs")
        .select(
          "id, created_at, gateway, gateway_product, event_type, outcome, response_code, response_message, error_category, duration_ms, request_payload, response_payload",
        )
        .eq("collection_item_id", id)
        .order("created_at", { ascending: true })
        .limit(200),

      // payment_webhook_logs no tiene FK al collection_item; matcheamos por
      // payment_token (formato WPY-XXXXXXXX) que es el invoiceNumber Mercantil.
      item.payment_token
        ? db
            .from("payment_webhook_logs")
            .select("id, received_at, status, payment_method, reference_number, amount, processed, processing_error, raw_payload")
            .eq("invoice_number", item.payment_token)
            .order("received_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: [] as never[], error: null }),

      db
        .from("odoo_sync_queue")
        .select(
          "id, status, odoo_invoice_id, attempts, last_attempt_at, last_error, post_invoice_done, register_payment_done, next_attempt_at, resolved_manually, resolution_notes",
        )
        .eq("collection_item_id", id)
        .maybeSingle(),
    ]);

    if (gatewayRes.error) console.error("[panel/tx/detail] gateway logs:", gatewayRes.error);
    if (webhookRes.error) console.error("[panel/tx/detail] webhook logs:", webhookRes.error);
    if (syncRes.error) console.error("[panel/tx/detail] sync queue:", syncRes.error);

    const gatewayEvents = gatewayRes.data || [];
    const webhookEvents = webhookRes.data || [];
    const syncQueue = syncRes.data || null;

    // ----- Timeline -----
    const timeline: TimelineEvent[] = [];
    timeline.push({ at: item.created_at, label: "Creado", tone: "info", detail: "Item registrado en la app" });

    for (const ev of gatewayEvents) {
      const at = ev.created_at;
      const product = ev.gateway_product ? ` · ${ev.gateway_product}` : "";
      const base = `${ev.gateway}${product}`;
      if (ev.event_type === "initiated") {
        timeline.push({ at, label: `Iniciado ${base}`, tone: "info" });
      } else if (ev.event_type === "request_sent") {
        timeline.push({ at, label: `Petición a ${base}`, tone: "info" });
      } else if (ev.event_type === "response_received") {
        timeline.push({
          at,
          label: `Respuesta de ${base}`,
          tone: ev.outcome === "success" ? "ok" : ev.outcome === "error" ? "fail" : "info",
          detail: ev.response_message || ev.response_code || null,
        });
      } else if (ev.event_type === "webhook_received") {
        timeline.push({ at, label: `Webhook ${base}`, tone: "info", detail: ev.response_message });
      } else if (ev.event_type === "success") {
        timeline.push({ at, label: `Éxito ${base}`, tone: "ok" });
      } else if (ev.event_type === "error") {
        timeline.push({
          at,
          label: `Error ${base}`,
          tone: "fail",
          detail: ev.response_message || ev.response_code,
        });
      } else if (ev.event_type === "timeout") {
        timeline.push({ at, label: `Timeout ${base}`, tone: "warn" });
      } else if (ev.event_type === "abandoned") {
        timeline.push({ at, label: `Abandonado ${base}`, tone: "warn" });
      }
    }

    if (item.paid_at) {
      timeline.push({ at: item.paid_at, label: "Pago confirmado", tone: "ok" });
    }

    if (syncQueue) {
      if (syncQueue.last_attempt_at) {
        timeline.push({
          at: syncQueue.last_attempt_at,
          label: `Sync Odoo · intento ${syncQueue.attempts}`,
          tone: syncQueue.status === "done" ? "ok" : syncQueue.status === "manual_review" ? "fail" : "warn",
          detail: syncQueue.last_error || null,
        });
      }
      if (syncQueue.resolved_manually) {
        timeline.push({
          at: syncQueue.last_attempt_at || item.created_at,
          label: "Sync resuelto manualmente",
          tone: "ok",
          detail: syncQueue.resolution_notes,
        });
      }
    }

    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // ----- Diagnóstico humano -----
    // Cubrimos TODOS los estados de collection_items, no solo failed/expired.
    // Un item en `conciliating` o `viewed` también necesita explicación para
    // que cobranzas sepa qué hacer (caso real: Henry Pérez Sabino quedó
    // "sin incidencias" cuando llevaba 4 días en conciliating).
    let diagnostic: TxDetail["diagnostic"] = null;

    const hoursOldCreated = hoursSince(item.created_at);
    const relativeCreated = formatRelative(item.created_at);

    if (item.status === "failed" || item.status === "expired") {
      const lastErr = [...gatewayEvents].reverse().find((e) => e.outcome === "error");
      if (lastErr) {
        const t = translateGatewayError(lastErr.gateway, lastErr.response_code, lastErr.response_message);
        if (t) diagnostic = t;
      }
      if (!diagnostic) {
        diagnostic = {
          reason:
            item.status === "expired"
              ? `El enlace de pago expiró sin que el cliente completara la operación (${relativeCreated} desde creación).`
              : "La transacción no se completó pero no hay log de la pasarela explicando por qué.",
          action:
            item.status === "expired"
              ? "Genera un nuevo enlace de pago para este cliente."
              : "Pídele al cliente confirmar si vio algún mensaje de error en su banco e intenta de nuevo.",
          severity: "warn",
        };
      }
    } else if (item.status === "conciliating") {
      // Esperando que la búsqueda de transferencia / webhook confirme el pago.
      const gatewayHasActivity = gatewayEvents.length > 0;
      const hasWebhook = webhookEvents.length > 0;

      if (!gatewayHasActivity && !hasWebhook && hoursOldCreated > 24) {
        diagnostic = {
          reason: `El item lleva ${relativeCreated} esperando reconciliación y no hay ninguna traza de la pasarela (sin intentos de búsqueda en Mercantil ni webhooks recibidos). El cron de búsqueda no corrió, falló sin loggear, o la transferencia que reportó el cliente no existe.`,
          action:
            "Pide captura del comprobante al cliente, verifica la cuenta destino (termina en 3031) y la referencia. Si el comprobante es real, fuerza búsqueda manual o concilia en Odoo y marca como resuelto.",
          severity: "error",
        };
      } else if (hoursOldCreated > 24) {
        diagnostic = {
          reason: `Esperando reconciliación desde hace ${relativeCreated}. Hay actividad de pasarela pero no se cerró el match.`,
          action:
            "Revisa la pestaña Pasarela para ver los intentos. Si todos fallaron, contacta al cliente para verificar referencia y monto.",
          severity: "warn",
        };
      } else {
        diagnostic = {
          reason: `Conciliando — el cliente reportó pago y el sistema está esperando confirmación. Lleva ${relativeCreated}.`,
          action:
            "Espera un poco más (el cron de búsqueda de transferencias corre periódicamente). Si pasa de 24h sin resolverse, contacta al cliente.",
          severity: "info",
        };
      }
    } else if (item.status === "viewed") {
      diagnostic = {
        reason: `El cliente abrió el enlace de pago pero no completó la operación. Visto hace ${relativeCreated}.`,
        action: hoursOldCreated > 48
          ? "Considera reenviar el enlace o llamar al cliente — ya pasaron más de 2 días."
          : "Dale un poco más de tiempo. Si pasa de 2 días, reenvía el enlace.",
        severity: hoursOldCreated > 48 ? "warn" : "info",
      };
    } else if (item.status === "sent") {
      diagnostic = {
        reason: `Enlace enviado pero el cliente no lo ha abierto. Lleva ${relativeCreated}.`,
        action: hoursOldCreated > 24
          ? "Verifica que el cliente haya recibido el WhatsApp/email. Considera un segundo envío o contacto directo."
          : "Espera respuesta del cliente. Reenvía si pasa de 24h.",
        severity: hoursOldCreated > 24 ? "warn" : "info",
      };
    } else if (item.status === "pending") {
      diagnostic = {
        reason: `Item creado hace ${relativeCreated} pero sin actividad de pago todavía.`,
        action:
          "Verifica si el enlace fue enviado al cliente. Si no, envíalo. Si ya se envió, espera la acción del cliente.",
        severity: "info",
      };
    } else if (syncQueue && syncQueue.status !== "done" && !syncQueue.resolved_manually) {
      const t = translateSyncError(syncQueue.last_error);
      if (t) diagnostic = t;
    } else if (item.status === "paid" && !syncQueue && !item.odoo_sync_synced_at) {
      diagnostic = {
        reason: "Pago recibido pero no se registró sync a Odoo (sin entrada en cola y sin marca de sync exitoso).",
        action: "Reportar al área técnica — la conciliación contable no se intentó automáticamente.",
        severity: "warn",
      };
    }
    // Nota: status="paid" con sync exitoso (queue done/resolved_manually O
    // odoo_sync_synced_at != null) deja diagnostic=null → drawer muestra
    // "sin incidencias detectadas". Eso es lo correcto.

    // ----- IDs de facturas Odoo (de metadata) -----
    const meta = (item.metadata || {}) as Record<string, unknown>;
    const odoo_invoice_ids = Array.isArray(meta.odoo_invoice_ids)
      ? (meta.odoo_invoice_ids as number[])
      : [];
    const odoo_invoices_meta = Array.isArray(meta.odoo_invoices)
      ? (meta.odoo_invoices as TxDetail["item"]["odoo_invoices_meta"])
      : [];

    // sync_status sintetizado.
    // Sin entrada en cola pero con odoo_sync_synced_at = sync sincrónico
    // exitoso (caso normal post-fix del 2026-06-03), no es huérfano.
    const sync_status = !syncQueue
      ? (item.odoo_sync_synced_at ? "synced" : "none")
      : syncQueue.resolved_manually || syncQueue.status === "done"
      ? "synced"
      : syncQueue.status === "pending"
      ? "pending"
      : syncQueue.status === "retrying"
      ? "retrying"
      : syncQueue.status === "manual_review"
      ? "manual_review"
      : syncQueue.status === "cancelled"
      ? "cancelled"
      : "pending";

    const invoiceFromMeta = odoo_invoices_meta[0]?.number || null;

    const detail: TxDetail = {
      item: {
        id: item.id,
        paid_at: item.paid_at,
        created_at: item.created_at,
        customer_name: item.customer_name,
        customer_cedula_rif: item.customer_cedula_rif,
        customer_email: item.customer_email,
        customer_phone: item.customer_phone,
        amount_usd: Number(item.amount_usd) || 0,
        amount_bss: item.amount_bss ? Number(item.amount_bss) : null,
        bcv_rate: item.bcv_rate ? Number(item.bcv_rate) : null,
        payment_method: item.payment_method as TxDetail["item"]["payment_method"],
        payment_reference: item.payment_reference,
        status: item.status as TxDetail["item"]["status"],
        invoice_number: item.invoice_number || invoiceFromMeta,
        sync_status: sync_status as TxDetail["item"]["sync_status"],
        sync_error_short: syncQueue?.last_error ? syncQueue.last_error.slice(0, 140) : null,
        concept: item.concept,
        metadata: meta,
        expires_at: item.expires_at,
        odoo_invoice_ids,
        odoo_invoices_meta,
      },
      timeline,
      gatewayEvents,
      syncQueue,
      webhookEvents,
      diagnostic,
    };

    return apiSuccess(detail);
  } catch (err) {
    return apiServerError(err);
  }
}
