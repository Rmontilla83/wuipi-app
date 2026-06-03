// Tipos compartidos entre el panel de Cobranzas (UI + API).

export type TxStatus = "pending" | "sent" | "viewed" | "paid" | "failed" | "expired" | "conciliating";
export type TxMethod = "debito_inmediato" | "transferencia" | "c2p" | "stripe" | "paypal" | "cash" | "pending";
// "n_a" = no aplica: el pago no se concretó (viewed/sent/pending/failed/
// expired/conciliating), no hay nada que sincronizar a Odoo todavía.
// "none" = huérfano REAL: el pago SÍ se concretó (paid) pero no tiene
// entrada en la cola ni marca de sync — eso sí requiere atención.
export type SyncStatus = "synced" | "pending" | "retrying" | "manual_review" | "cancelled" | "none" | "n_a";

export type TxListItem = {
  id: string;
  paid_at: string | null;
  created_at: string;
  customer_name: string;
  customer_cedula_rif: string;
  amount_usd: number;
  amount_bss: number | null;
  payment_method: TxMethod;
  payment_reference: string | null;
  status: TxStatus;
  invoice_number: string | null;
  sync_status: SyncStatus;
  sync_error_short: string | null;
};

export type TxListResponse = {
  items: TxListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type Kpis = {
  cobradoUsd: number;
  cobradoUsdPrev: number;
  cobradoBss: number;
  successRate: number;
  successRatePrev: number;
  failedCount: number;
  failedTopReason: string | null;
  pendingCount: number;
};

export type TimelineEvent = {
  at: string;
  label: string;
  detail?: string | null;
  tone: "ok" | "fail" | "warn" | "info";
};

export type TxDetail = {
  item: TxListItem & {
    customer_email: string | null;
    customer_phone: string | null;
    concept: string | null;
    bcv_rate: number | null;
    metadata: Record<string, unknown>;
    expires_at: string | null;
    odoo_invoice_ids: number[];
    odoo_invoices_meta: Array<{ id: number; number?: string; amount_residual?: number }>;
  };
  timeline: TimelineEvent[];
  gatewayEvents: Array<{
    id: string;
    created_at: string;
    gateway: string;
    gateway_product: string | null;
    event_type: string;
    outcome: string | null;
    response_code: string | null;
    response_message: string | null;
    error_category: string | null;
    duration_ms: number | null;
    request_payload: unknown;
    response_payload: unknown;
  }>;
  syncQueue: null | {
    id: string;
    status: string;
    odoo_invoice_id: number | null;
    attempts: number;
    last_attempt_at: string | null;
    last_error: string | null;
    post_invoice_done: boolean;
    register_payment_done: boolean;
    next_attempt_at: string;
    resolved_manually: boolean;
    resolution_notes: string | null;
  };
  webhookEvents: Array<{
    id: string;
    received_at: string;
    status: string | null;
    payment_method: string | null;
    reference_number: string | null;
    amount: number | null;
    processed: boolean;
    processing_error: string | null;
    raw_payload: unknown;
  }>;
  diagnostic: {
    reason: string;
    action: string;
    severity: "info" | "warn" | "error";
  } | null;
};
