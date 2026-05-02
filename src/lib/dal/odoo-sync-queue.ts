// ============================================================
// DAL — Cola asíncrona de sync Odoo
// ============================================================

import { createAdminSupabase } from "@/lib/supabase/server";

export type OdooSyncQueueStatus = "pending" | "retrying" | "manual_review" | "done" | "cancelled";

export interface OdooSyncQueueItem {
  id: string;
  collection_item_id: string;
  odoo_invoice_id: number | null;
  odoo_partner_id: number | null;
  payment_method: string;
  payment_reference: string | null;
  payment_token: string;
  payment_date: string | null;
  amount_usd: number | null;
  amount_ves: number | null;
  attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  post_invoice_done: boolean;
  register_payment_done: boolean;
  status: OdooSyncQueueStatus;
  telegram_notified_at: string | null;
  resolved_manually: boolean;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Backoff exponencial. Devuelve los minutos a esperar antes del próximo intento
 * según el número de intento actual (0-indexed).
 *
 * intento 0 (primer fallo)  -> 5 min
 * intento 1                 -> 15 min
 * intento 2                 -> 1 hora
 * intento 3                 -> 6 horas
 * intento 4                 -> 24 horas
 * intento 5+                -> manual_review (no más reintentos)
 */
export const BACKOFF_MINUTES = [5, 15, 60, 360, 1440] as const;
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length; // 5

export function nextAttemptAt(attempts: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * Encola un item para sync Odoo asíncrono. Se llama desde el alias del webhook
 * /api/mercantil cuando el sync síncrono falla, o desde la UI admin "encolar
 * manual".
 *
 * Idempotente: si el collection_item_id ya tiene una entrada en la cola, hace
 * upsert (UNIQUE constraint en collection_item_id).
 */
export async function enqueueOdooSync(opts: {
  collection_item_id: string;
  odoo_invoice_id?: number | null;
  odoo_partner_id?: number | null;
  payment_method: string;
  payment_reference?: string | null;
  payment_token: string;
  payment_date?: string | null;
  amount_usd?: number | null;
  amount_ves?: number | null;
  initial_error?: string;
}): Promise<OdooSyncQueueItem> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("odoo_sync_queue")
    .upsert({
      collection_item_id: opts.collection_item_id,
      odoo_invoice_id: opts.odoo_invoice_id ?? null,
      odoo_partner_id: opts.odoo_partner_id ?? null,
      payment_method: opts.payment_method,
      payment_reference: opts.payment_reference ?? null,
      payment_token: opts.payment_token,
      payment_date: opts.payment_date ?? null,
      amount_usd: opts.amount_usd ?? null,
      amount_ves: opts.amount_ves ?? null,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: opts.initial_error ?? null,
    }, { onConflict: "collection_item_id" })
    .select()
    .single();
  if (error) throw error;
  return data as OdooSyncQueueItem;
}

/**
 * Trae items listos para procesar por el cron (status pending/retrying con
 * next_attempt_at <= NOW). Limit defensivo para no procesar miles de una sola
 * vez (el cron corre cada 10 min, debería alcanzar).
 */
export async function getReadyToProcess(limit = 50): Promise<OdooSyncQueueItem[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("odoo_sync_queue")
    .select("*")
    .in("status", ["pending", "retrying"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []) as OdooSyncQueueItem[];
}

/**
 * Marca un item como exitosamente procesado.
 */
export async function markQueueItemDone(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("odoo_sync_queue")
    .update({
      status: "done",
      last_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Marca un item como fallido tras un intento. Calcula el próximo intento con
 * backoff. Si ya alcanzó MAX_ATTEMPTS, queda en manual_review.
 */
export async function markQueueItemFailed(id: string, opts: {
  error: string;
  post_invoice_done?: boolean;
  register_payment_done?: boolean;
}): Promise<{ status: OdooSyncQueueStatus; attempts: number }> {
  const sb = createAdminSupabase();

  // Leer attempts actuales
  const { data: existing } = await sb
    .from("odoo_sync_queue")
    .select("attempts")
    .eq("id", id)
    .single();
  const newAttempts = (existing?.attempts || 0) + 1;
  const newStatus: OdooSyncQueueStatus = newAttempts >= MAX_ATTEMPTS ? "manual_review" : "retrying";

  const update: Record<string, unknown> = {
    attempts: newAttempts,
    status: newStatus,
    last_attempt_at: new Date().toISOString(),
    last_error: opts.error.slice(0, 2000),
  };
  if (newStatus === "retrying") {
    update.next_attempt_at = nextAttemptAt(newAttempts - 1).toISOString();
  }
  if (opts.post_invoice_done !== undefined) update.post_invoice_done = opts.post_invoice_done;
  if (opts.register_payment_done !== undefined) update.register_payment_done = opts.register_payment_done;

  const { error } = await sb.from("odoo_sync_queue").update(update).eq("id", id);
  if (error) throw error;
  return { status: newStatus, attempts: newAttempts };
}

/**
 * Marca el progreso parcial cuando una operación intermedia tuvo éxito (ej.
 * post_invoice OK pero register_payment falló).
 */
export async function markQueueItemProgress(id: string, opts: {
  post_invoice_done?: boolean;
  register_payment_done?: boolean;
}): Promise<void> {
  const sb = createAdminSupabase();
  const update: Record<string, unknown> = {};
  if (opts.post_invoice_done !== undefined) update.post_invoice_done = opts.post_invoice_done;
  if (opts.register_payment_done !== undefined) update.register_payment_done = opts.register_payment_done;
  if (Object.keys(update).length === 0) return;
  const { error } = await sb.from("odoo_sync_queue").update(update).eq("id", id);
  if (error) throw error;
}

/**
 * Marca el item como manual_review + telegram_notified_at. Usado tras enviar
 * la alerta a Telegram para no volver a notificar en cada cron run.
 */
export async function markQueueItemNotified(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("odoo_sync_queue")
    .update({ telegram_notified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Busca items en manual_review que aún no fueron notificados. Para que el
 * cron envíe la alerta una sola vez.
 */
export async function getUnnotifiedManualReviewItems(): Promise<OdooSyncQueueItem[]> {
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("odoo_sync_queue")
    .select("*")
    .eq("status", "manual_review")
    .is("telegram_notified_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as OdooSyncQueueItem[];
}

/**
 * Lista items para la UI admin con filtros opcionales.
 */
export async function listQueueItems(opts: {
  status?: OdooSyncQueueStatus[];
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: OdooSyncQueueItem[]; total: number }> {
  const sb = createAdminSupabase();
  let q = sb.from("odoo_sync_queue").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (opts.status && opts.status.length > 0) q = q.in("status", opts.status);
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 50) - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { items: (data || []) as OdooSyncQueueItem[], total: count || 0 };
}

/**
 * Reset de un item en manual_review (o failed) para que el cron lo vuelva a
 * intentar. Usado desde la UI admin "Reintentar ahora".
 */
export async function retryQueueItem(id: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("odoo_sync_queue")
    .update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Marca un item como resuelto manualmente (admin lo procesó por fuera del sync).
 */
export async function markQueueItemResolvedManually(id: string, opts: {
  user_id: string;
  notes?: string;
}): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("odoo_sync_queue")
    .update({
      status: "done",
      resolved_manually: true,
      resolved_by_user_id: opts.user_id,
      resolved_at: new Date().toISOString(),
      resolution_notes: opts.notes ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Cancela un item (no se procesa más).
 */
export async function cancelQueueItem(id: string, notes?: string): Promise<void> {
  const sb = createAdminSupabase();
  const { error } = await sb
    .from("odoo_sync_queue")
    .update({
      status: "cancelled",
      resolution_notes: notes ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
