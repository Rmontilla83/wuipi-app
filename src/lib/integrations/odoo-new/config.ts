// ============================================================
// Odoo NEW — configuración de IDs y constantes del nuevo Odoo
// Anclado al estado documentado en MIGRATION-DISCOVERY*.md (2026-05-23)
// ============================================================

/** Nombre de la base de datos en erp.wuipi.net. Única DB del servidor. */
export const NEW_ODOO_DB = "wuipi";

/**
 * IDs de currencies en el Odoo nuevo. Cambian respecto del viejo (VED=166→171).
 * Validados via: `SELECT id, name FROM res_currency` (Discovery #1).
 */
export const CURRENCY_IDS = {
  USD: 1,
  VED: 171,
  EUR: 126,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_IDS;

/**
 * Mapeo bidireccional id ↔ code. Útil cuando Odoo devuelve `currency_id: [id, name]`
 * y necesitamos el code canónico.
 */
const CURRENCY_CODE_BY_ID: Record<number, CurrencyCode> = {
  [CURRENCY_IDS.USD]: "USD",
  [CURRENCY_IDS.VED]: "VED",
  [CURRENCY_IDS.EUR]: "EUR",
};

export function currencyCodeFromId(id: number | null | undefined): CurrencyCode | null {
  if (id == null) return null;
  return CURRENCY_CODE_BY_ID[id] ?? null;
}

/**
 * IDs de account.journal en el Odoo nuevo.
 * Validados via: search_read en Discovery #1.
 * En el día del cutover hay que verificar que estos IDs no cambiaron.
 */
export const JOURNAL_IDS = {
  CUSTOMER_INVOICES: 1,           // INV — Customer Invoices (sale)
  BNK1_GENERIC: 6,                // BNK1 — Bank
  CASH: 7,                        // CSH1 — Cash
  REMP_RECIBOS_USD_EMPLEADOS: 8,  // REMP — Recibos USD Empleados (sale, USD)
  BANESCO_1730: 9,                // BNK2 — Banco Banesco 1730
  BDV_8937: 10,                   // BNK3 — Banco de Venezuela 8937
  BNC_5214: 11,                   // BNK4 — Banco Nacional de Credito (BNC) 5214
  TESORO_9877: 12,                // BNK5 — Banco del Tesoro 9877
  MERCANTIL_USD_9021: 13,         // BNK6 — Banco Mercantil 9021 (USD)
  MERCANTIL_EUR_9048: 14,         // BNK7 — Banco Mercantil 9048 (EUR)
  PAGOS_ELECTRONICOS: 15,         // BNK8 — Pagos Electronicos (USD) — Stripe/PayPal
  BANCAMIGA_1945: 16,             // BNK9 — Bancamiga 1945
  MIG01_SALDOS_PREVIOS: 17,       // MIG01 — Diario de Migracion (Saldos Previos)
  RETENCIONES: 18,                // CSH2 — Retenciones
  IGTF: 19,                       // IGTF — IGTF
  RECIBOS_SUSCRIPCIONES: 24,      // REC — Recibos Suscripciones (sale)
  FACTURAS_HISTORICAS: 25,        // REC1 — Facturas Historicas (sale)
} as const;

/**
 * Estado de la suscripción comercial (campo `wuipi_subscription_state` en contract.contract).
 * Valores definidos por el módulo `wuipi_subscription_isp`.
 */
export const SUBSCRIPTION_STATE = {
  DRAFT: "1_draft",
  RENEWAL: "2_renewal",
  PROGRESS: "3_progress",
  PAUSED: "4_paused",
  CHURN: "6_churn",
  UPSELL: "7_upsell",
} as const;

export type SubscriptionStateRaw = (typeof SUBSCRIPTION_STATE)[keyof typeof SUBSCRIPTION_STATE];

/**
 * Estado del ciclo de vida ISP (campo `wuipi_state` en contract.contract).
 * Valores definidos por el módulo `wuipi_subscription_isp`.
 */
export const LIFECYCLE_STATE = {
  ACTIVE: "active",
  GRACE_PERIOD: "grace_period",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
  CHURNED: "churned",
} as const;

export type LifecycleStateRaw = (typeof LIFECYCLE_STATE)[keyof typeof LIFECYCLE_STATE];

/**
 * Mapeo de método de pago de la app → journal Odoo.
 * Usado cuando registramos un pago manual o un payment.transaction completado.
 */
export const PAYMENT_METHOD_TO_JOURNAL: Record<string, number> = {
  mercantil_boton_web: JOURNAL_IDS.PAGOS_ELECTRONICOS,
  mercantil_c2p: JOURNAL_IDS.PAGOS_ELECTRONICOS,
  mercantil_transferencia_usd: JOURNAL_IDS.MERCANTIL_USD_9021,
  mercantil_transferencia_eur: JOURNAL_IDS.MERCANTIL_EUR_9048,
  stripe: JOURNAL_IDS.PAGOS_ELECTRONICOS,
  paypal: JOURNAL_IDS.PAGOS_ELECTRONICOS,
  cash: JOURNAL_IDS.CASH,
  banesco: JOURNAL_IDS.BANESCO_1730,
  bdv: JOURNAL_IDS.BDV_8937,
  bnc: JOURNAL_IDS.BNC_5214,
  tesoro: JOURNAL_IDS.TESORO_9877,
  bancamiga: JOURNAL_IDS.BANCAMIGA_1945,
};
