// ============================================================
// sendCobranzasWA — wrapper con dry-run para el riel de Cobranzas
// ============================================================
//
// IMPORTANTE: este helper es DISTINTO de `sendPaymentConfirmationWhatsApp`
// y `sendCollectionWhatsApp` que viven en src/lib/notifications/whatsapp.ts.
// Esos siguen siendo el canal real para confirmaciones de pago — no se
// tocan, ya estan en produccion.
//
// Este modulo es para el RIEL NUEVO de cobranzas (Stream A4 en adelante):
//   - Auto-mensaje cuando falla la pasarela
//   - Calendario mensual D-27, D1, D3, D5, D7, D8, D15, D20, D38
//   - Mensajes desde el bot de cobranzas (futuro Stream C3)
//
// Politica:
//   - COBRANZAS_WA_DRY_RUN=true (default) → registra en cobranzas_wa_outbox
//     con dry_run=true, status=dry_run, y NO llama Meta API.
//   - COBRANZAS_WA_DRY_RUN=false → envia via Meta y registra el resultado.
//
// El usuario quiere validar funcionamiento en pruebas progresivas antes
// de activar el envio real (el numero +584248800723 esta en produccion).

import { createAdminSupabase } from "@/lib/supabase/server";
import { WA_TEMPLATES_COBRANZAS, type WATemplateName } from "./wa-templates";

// ----- Phone normalization (mismo patron que whatsapp.ts) -------

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = "58" + digits.slice(1);
  if (!digits.startsWith("58") && digits.length === 10) digits = "58" + digits;
  return digits;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  if (digits.length <= 7) return digits.slice(0, 2) + "***" + digits.slice(-2);
  return digits.slice(0, 4) + "*".repeat(Math.max(3, digits.length - 8)) + digits.slice(-4);
}

// ----- Types -------------------------------------------------------

export interface SendCobranzasWAInput {
  /** Telefono destino (cualquier formato) — se normaliza */
  phone: string;
  /** Nombre del cliente para registro y fallback */
  customerName: string;
  /** Template a usar (key de WA_TEMPLATES_COBRANZAS) */
  template: WATemplateName;
  /** Variables del template — se mapean a {{1}}, {{2}}, ... posicional en el body */
  params: Record<string, string>;
  /**
   * Parametros para botones URL dinamicos (Meta los pide aparte del body).
   * El indice del array = indice del boton en el template (0 = primer boton URL).
   * Solo necesario cuando el template tiene un boton URL con `{{N}}` en la URL.
   */
  buttonUrlParams?: string[];
  /** Que evento del riel disparo este mensaje */
  triggerEvent:
    | "payment_failure_case"
    | "collection_calendar_d27"
    | "collection_calendar_d1"
    | "collection_calendar_d3"
    | "collection_calendar_d5"
    | "collection_calendar_d7"
    | "collection_calendar_d8"
    | "collection_calendar_d15"
    | "collection_calendar_d20"
    | "collection_calendar_d38"
    | "manual_test"
    | "portal_invite"
    | "bot_response";
  /** Vinculo opcional al item de cobro origen */
  collectionItemId?: string | null;
  /** Vinculo opcional al caso del kanban */
  crmCollectionId?: string | null;
  /** Forzar dry-run aunque la env diga otra cosa (para pruebas internas) */
  forceDryRun?: boolean;
  /**
   * Forzar envio REAL aunque la env COBRANZAS_WA_DRY_RUN este en true.
   * Usado por flujos transaccionales (ej. invitacion al portal) que deben
   * salir reales independiente del estado global del riel de cobranzas
   * masivas. `forceDryRun` siempre gana sobre `forceLive`.
   */
  forceLive?: boolean;
}

export interface SendCobranzasWAResult {
  ok: boolean;
  outboxId: string;
  dryRun: boolean;
  status: "dry_run" | "sent" | "failed" | "skipped";
  metaMessageId?: string;
  error?: string;
}

// ----- Helpers internos -------------------------------------------

function isDryRunMode(forceDryRun?: boolean, forceLive?: boolean): boolean {
  if (forceDryRun) return true;     // forceDryRun siempre gana
  if (forceLive) return false;       // override de flujos transaccionales
  // Default = true. Solo cuando explicitamente se setea "false" se envia real.
  const v = (process.env.COBRANZAS_WA_DRY_RUN || "true").toLowerCase();
  return v !== "false";
}

function getMetaConfig(): { phoneId: string; token: string; lang: string } | null {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return null;
  return {
    phoneId,
    token,
    lang: process.env.WHATSAPP_TEMPLATE_LANG || "es",
  };
}

// Construye el body que iria a Meta v21.0 messages endpoint
function buildMetaPayload(opts: {
  to: string;
  templateName: string;
  lang: string;
  params: Record<string, string>;
  buttons?: { type: "url" | "quick_reply"; text: string; url?: string }[];
  buttonUrlParams?: string[];
}): Record<string, unknown> {
  // Meta usa parametros posicionales {{1}}, {{2}}, ... — los keys del objeto
  // (1, 2, 3, ...) determinan el orden. Filtramos cualquier key no-numerico
  // para que `portal_url` u otros pseudo-params del fallback no terminen
  // mandados como variable del body en el template aprobado.
  const orderedKeys = Object.keys(opts.params)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  const bodyParams = orderedKeys.map(k => ({ type: "text", text: opts.params[k] }));

  const components: Record<string, unknown>[] = [
    { type: "body", parameters: bodyParams },
  ];

  // Botones URL dinamicos — Meta exige un componente por boton, con
  // sub_type=url e index 0,1,2... segun el orden en que se aprobaron en el
  // template. El template `invitacion_portal` tiene 1 boton URL.
  if (opts.buttonUrlParams && opts.buttonUrlParams.length > 0) {
    opts.buttonUrlParams.forEach((value, idx) => {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(idx),
        parameters: [{ type: "text", text: value }],
      });
    });
  }

  return {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.lang },
      components,
    },
  };
}

// ----- Public API ------------------------------------------------

/**
 * Envia un mensaje WA del riel de cobranzas. Respeta dry-run mode.
 *
 * Comportamiento:
 *   - Siempre crea row en cobranzas_wa_outbox (audit/forensics)
 *   - Si dryRun: status='dry_run', no llama Meta
 *   - Si !dryRun: llama Meta API, status='sent' / 'failed' segun resultado
 *
 * Nunca lanza — los errores se reportan en `result.error`.
 */
export async function sendCobranzasWA(
  input: SendCobranzasWAInput
): Promise<SendCobranzasWAResult> {
  const sb = createAdminSupabase();
  const dryRun = isDryRunMode(input.forceDryRun, input.forceLive);
  const tpl = WA_TEMPLATES_COBRANZAS[input.template];

  if (!tpl) {
    // Template no existe — record skip
    const { data } = await sb.from("cobranzas_wa_outbox").insert({
      customer_phone: input.phone,
      customer_phone_masked: maskPhone(input.phone),
      customer_name: input.customerName,
      template_name: input.template,
      template_lang: "es",
      template_params: input.params,
      trigger_event: input.triggerEvent,
      collection_item_id: input.collectionItemId ?? null,
      crm_collection_id: input.crmCollectionId ?? null,
      status: "skipped",
      dry_run: dryRun,
      error_message: `Template no definido: ${input.template}`,
    }).select("id").single();
    return {
      ok: false,
      outboxId: data?.id || "",
      dryRun,
      status: "skipped",
      error: `Template no definido: ${input.template}`,
    };
  }

  const normalizedPhone = normalizePhone(input.phone);
  const fallbackText = tpl.fallback(input.params);

  // ---- 1. Insert audit row ANTES de cualquier intento de envio ----
  const { data: row, error: insErr } = await sb
    .from("cobranzas_wa_outbox")
    .insert({
      customer_phone: normalizedPhone,
      customer_phone_masked: maskPhone(normalizedPhone),
      customer_name: input.customerName,
      template_name: tpl.name,
      template_lang: tpl.lang,
      template_params: input.params,
      fallback_text: fallbackText,
      trigger_event: input.triggerEvent,
      collection_item_id: input.collectionItemId ?? null,
      crm_collection_id: input.crmCollectionId ?? null,
      status: dryRun ? "dry_run" : "queued",
      dry_run: dryRun,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    return {
      ok: false,
      outboxId: "",
      dryRun,
      status: "failed",
      error: `outbox insert fallo: ${insErr?.message || "unknown"}`,
    };
  }

  const outboxId = row.id;

  // ---- 2. Si dry-run, terminar aqui ----
  if (dryRun) {
    console.log(
      `[sendCobranzasWA] DRY-RUN ${input.triggerEvent} → ${tpl.name} ` +
      `to=${maskPhone(normalizedPhone)} outbox=${outboxId}`
    );
    return { ok: true, outboxId, dryRun: true, status: "dry_run" };
  }

  // ---- 3. Modo real: enviar a Meta ----
  const meta = getMetaConfig();
  if (!meta) {
    await sb.from("cobranzas_wa_outbox").update({
      status: "failed",
      error_message: "Meta env vars (WHATSAPP_PHONE_NUMBER_ID/ACCESS_TOKEN) faltan",
    }).eq("id", outboxId);
    return { ok: false, outboxId, dryRun: false, status: "failed", error: "Meta env vars faltan" };
  }

  const url = `https://graph.facebook.com/v21.0/${meta.phoneId}/messages`;
  const payload = buildMetaPayload({
    to: normalizedPhone,
    templateName: tpl.name,
    lang: meta.lang,
    params: input.params,
    buttons: tpl.buttons,
    buttonUrlParams: input.buttonUrlParams,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${meta.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));

    if (res.ok) {
      const msgId = (body.messages && body.messages[0]?.id) || null;
      await sb.from("cobranzas_wa_outbox").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        meta_message_id: msgId,
        meta_response: body,
      }).eq("id", outboxId);
      return { ok: true, outboxId, dryRun: false, status: "sent", metaMessageId: msgId || undefined };
    } else {
      // Template error 132xxx — fallback a texto libre
      const errCode = body?.error?.code;
      const templateErrors = [132000, 132001, 132005, 132007, 132012, 132015];
      if (templateErrors.includes(Number(errCode))) {
        const fbRes = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${meta.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: normalizedPhone,
            type: "text",
            text: { body: fallbackText },
          }),
        });
        const fbBody = await fbRes.json().catch(() => ({}));
        if (fbRes.ok) {
          const msgId = (fbBody.messages && fbBody.messages[0]?.id) || null;
          await sb.from("cobranzas_wa_outbox").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            meta_message_id: msgId,
            meta_response: { template_error: body, fallback_used: true, fallback_response: fbBody },
          }).eq("id", outboxId);
          return { ok: true, outboxId, dryRun: false, status: "sent", metaMessageId: msgId || undefined };
        }
        // Fallback tambien fallo
        await sb.from("cobranzas_wa_outbox").update({
          status: "failed",
          meta_response: { template_error: body, fallback_error: fbBody },
          error_message: `template y fallback fallaron: ${JSON.stringify(fbBody?.error || fbBody)}`,
        }).eq("id", outboxId);
        return { ok: false, outboxId, dryRun: false, status: "failed", error: "fallback fallo" };
      }

      // Otro error
      await sb.from("cobranzas_wa_outbox").update({
        status: "failed",
        meta_response: body,
        error_message: `Meta API ${res.status}: ${JSON.stringify(body?.error || body)}`,
      }).eq("id", outboxId);
      return { ok: false, outboxId, dryRun: false, status: "failed", error: `Meta API ${res.status}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    await sb.from("cobranzas_wa_outbox").update({
      status: "failed",
      error_message: `exception: ${msg}`,
    }).eq("id", outboxId);
    return { ok: false, outboxId, dryRun: false, status: "failed", error: msg };
  }
}

/**
 * Helper para verificar el modo actual desde tests/UI.
 */
export function getCobranzasWAMode(): "dry_run" | "live" {
  return isDryRunMode() ? "dry_run" : "live";
}
