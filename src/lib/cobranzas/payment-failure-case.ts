// ============================================================
// createPaymentFailureCase — auto-ticket en kanban Cobranzas
// ============================================================
//
// Cuando una pasarela rechaza un pago o el cliente abandona, este helper:
//   1. Crea un caso en `crm_collections` con stage='falla_pasarela'
//   2. Vincula el caso al `collection_item` origen para evitar duplicados
//      (idempotencia atomica via UNIQUE INDEX uniq_active_case_per_item_stage)
//   3. Dispara mensaje WA "vimos un inconveniente" — en modo dry-run hasta
//      que activemos el envio real
//
// Casos cubiertos por gateway:
//   Mercantil  → errorCode 4025 (intra-bank), 821 (creds), webhook decline
//   C2P        → OTP fallido, fondos insuficientes, decline tardio
//   Stripe     → checkout fallo, signature invalida, capture fallo
//   PayPal     → capture no COMPLETED, amount mismatch
//   Transferencia → reportada pero auto-verify fallo (Mercantil 99999)
//   Abandono   → item viewed > 60 min sin paid (cron, futuro Stream A7)
//
// El llamado nunca lanza — fail to-create-case no debe bloquear el
// response al cliente o webhook.

import { createAdminSupabase } from "@/lib/supabase/server";
import { sendCobranzasWA } from "./wa-cobranzas";
import type { Gateway } from "@/lib/dal/payment-gateway-logs";

export interface PaymentFailureContext {
  /** UUID del collection_item que tuvo el fallo */
  collectionItemId: string;
  /** Pasarela que disparo el fallo */
  gateway: Gateway;
  /** Producto especifico (web_button, c2p_payment, etc.) */
  gatewayProduct?: string | null;
  /** Tipo de fallo para clasificacion */
  failureType:
    | "intra_bank_limit"
    | "insufficient_funds"
    | "invalid_otp"
    | "invalid_credentials"
    | "gateway_error"
    | "amount_mismatch"
    | "abandoned"
    | "manual_report";
  /** Codigo bruto de la pasarela (para audit) */
  errorCode?: string | null;
  /** Mensaje del error (para audit) */
  errorMessage?: string | null;
  /** ID del usuario que creo el caso (si fue manual). Para auto-creacion: null */
  createdByUserId?: string | null;
}

export interface CreatePaymentFailureCaseResult {
  ok: boolean;
  caseId?: string;
  alreadyExisted: boolean;
  waOutboxId?: string;
  waDryRun?: boolean;
  error?: string;
}

// Mensaje contextual por tipo de fallo (lo que el cliente lee en WA)
function failureContextMessage(failureType: PaymentFailureContext["failureType"]): string {
  switch (failureType) {
    case "intra_bank_limit":
      return "(tu banco no permite este tipo de transaccion intra-bancaria)";
    case "insufficient_funds":
      return "(fondos insuficientes en la cuenta)";
    case "invalid_otp":
      return "(la clave de pago no era valida o expiro)";
    case "invalid_credentials":
      return "(las credenciales no fueron aceptadas)";
    case "amount_mismatch":
      return "(el monto reportado no coincidio con el esperado)";
    case "abandoned":
      return "";  // no hace falta especificar
    case "manual_report":
      return "(reportado por nuestro equipo)";
    case "gateway_error":
    default:
      return "";
  }
}

// Genera un codigo legible para el caso
function generateCaseCode(): string {
  // FP-XXXXXX (Falla Pasarela)
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  return `FP-${ts}`;
}

/**
 * Crea un caso en el kanban a partir de un fallo de pasarela. Idempotente:
 * si ya existe un caso abierto para el mismo collection_item en stage
 * 'falla_pasarela', NO crea otro y devuelve `alreadyExisted=true`.
 *
 * El UNIQUE INDEX `uniq_active_case_per_item_stage` garantiza la
 * idempotencia atomicamente — si dos webhooks paralelos llaman este
 * helper a la vez, solo uno gana el INSERT y el otro recibe error 23505
 * que aqui se traduce a `alreadyExisted=true`.
 */
export async function createPaymentFailureCase(
  ctx: PaymentFailureContext
): Promise<CreatePaymentFailureCaseResult> {
  try {
    const sb = createAdminSupabase();

    // Lee el item de cobro para obtener los datos del cliente
    const { data: item, error: itemErr } = await sb
      .from("collection_items")
      .select("*")
      .eq("id", ctx.collectionItemId)
      .single();

    if (itemErr || !item) {
      return {
        ok: false,
        alreadyExisted: false,
        error: `collection_item no encontrado: ${ctx.collectionItemId}`,
      };
    }

    // Pre-check no atomico (best-effort): si ya hay caso abierto, salimos rapido
    // sin pegar contra el UNIQUE. La constraint cubre la race; este check ahorra
    // un round-trip si no hay race.
    const { data: existing } = await sb
      .from("crm_collections")
      .select("id")
      .eq("source_collection_item_id", ctx.collectionItemId)
      .eq("stage", "falla_pasarela")
      .is("closed_at", null)
      .limit(1);

    if (existing && existing.length > 0) {
      return {
        ok: true,
        caseId: existing[0].id,
        alreadyExisted: true,
      };
    }

    // INSERT — el UNIQUE INDEX cubre la race condition
    const insertPayload = {
      code: generateCaseCode(),
      // client_id null porque los clientes viven en Odoo, no en clients local
      client_id: null,
      client_name: item.customer_name,
      client_phone: item.customer_phone,
      client_email: item.customer_email,
      stage: "falla_pasarela",
      source: "payment_failure",
      source_collection_item_id: item.id,
      amount_due: Number(item.amount_usd),
      currency: "USD",
      days_overdue: 0,  // recien ocurrio
      months_overdue: 0,
      notes: `Fallo de pasarela ${ctx.gateway} (${ctx.gatewayProduct || "?"}): ${ctx.failureType}` +
             (ctx.errorMessage ? ` — ${ctx.errorMessage}` : ""),
      failure_metadata: {
        gateway: ctx.gateway,
        gateway_product: ctx.gatewayProduct ?? null,
        failure_type: ctx.failureType,
        error_code: ctx.errorCode ?? null,
        error_message: ctx.errorMessage ?? null,
        created_by_user_id: ctx.createdByUserId ?? null,
        item_invoice_number: item.invoice_number ?? null,
        item_payment_token: item.payment_token,
      },
    };

    const { data: newCase, error: insErr } = await sb
      .from("crm_collections")
      .insert(insertPayload)
      .select("id")
      .single();

    // Idempotencia atomica: si la UNIQUE constraint dispara (otro proceso
    // gano la race), buscamos el caso existente y lo devolvemos.
    if (insErr) {
      const isUniqueViolation = insErr.code === "23505";
      if (isUniqueViolation) {
        const { data: raceCase } = await sb
          .from("crm_collections")
          .select("id")
          .eq("source_collection_item_id", ctx.collectionItemId)
          .eq("stage", "falla_pasarela")
          .is("closed_at", null)
          .limit(1);
        return {
          ok: true,
          caseId: raceCase?.[0]?.id,
          alreadyExisted: true,
        };
      }
      return {
        ok: false,
        alreadyExisted: false,
        error: `INSERT crm_collections fallo: ${insErr.message}`,
      };
    }

    if (!newCase) {
      return { ok: false, alreadyExisted: false, error: "INSERT no devolvio row" };
    }

    // Mensaje WA al cliente — DRY-RUN por defecto
    let waResult: Awaited<ReturnType<typeof sendCobranzasWA>> | null = null;
    if (item.customer_phone) {
      const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net"}/pagar/${item.payment_token}`;
      waResult = await sendCobranzasWA({
        phone: item.customer_phone,
        customerName: item.customer_name,
        template: "payment_failure_apology",
        params: {
          "1": item.customer_name,
          "2": failureContextMessage(ctx.failureType),
          "3": portalUrl,
        },
        triggerEvent: "payment_failure_case",
        collectionItemId: item.id,
        crmCollectionId: newCase.id,
      });

      // Actualiza last_wa_sent_at en el caso (aunque sea dry-run, registramos)
      if (waResult.ok) {
        await sb.from("crm_collections")
          .update({ last_wa_sent_at: new Date().toISOString() })
          .eq("id", newCase.id);
      }
    }

    console.log(
      `[createPaymentFailureCase] Caso creado: ${newCase.id} ` +
      `gateway=${ctx.gateway} type=${ctx.failureType} ` +
      `wa_status=${waResult?.status || "no_phone"} dry_run=${waResult?.dryRun ?? "—"}`
    );

    return {
      ok: true,
      caseId: newCase.id,
      alreadyExisted: false,
      waOutboxId: waResult?.outboxId,
      waDryRun: waResult?.dryRun,
    };
  } catch (err) {
    return {
      ok: false,
      alreadyExisted: false,
      error: err instanceof Error ? err.message : "unknown exception",
    };
  }
}

/**
 * Llamado cuando un collection_item pasa a 'paid' — cierra automaticamente
 * cualquier caso abierto vinculado a ese item. El kanban refleja la realidad
 * sin que el agente tenga que mover la card manualmente.
 */
export async function closeOpenCasesForPaidItem(
  collectionItemId: string
): Promise<{ closed: number }> {
  try {
    const sb = createAdminSupabase();
    const { data, error } = await sb
      .from("crm_collections")
      .update({
        stage: "resuelto",
        closed_at: new Date().toISOString(),
        recovered_at: new Date().toISOString(),
      })
      .eq("source_collection_item_id", collectionItemId)
      .is("closed_at", null)
      .select("id");
    if (error) {
      console.error("[closeOpenCasesForPaidItem] update fallo:", error.message);
      return { closed: 0 };
    }
    return { closed: data?.length || 0 };
  } catch (err) {
    console.error("[closeOpenCasesForPaidItem] exception:", err);
    return { closed: 0 };
  }
}
