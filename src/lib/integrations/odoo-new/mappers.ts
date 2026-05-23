// ============================================================
// Helpers de mapeo: raw Odoo data → tipos de dominio
// ============================================================

import {
  CURRENCY_IDS,
  currencyCodeFromId,
  LIFECYCLE_STATE,
  SUBSCRIPTION_STATE,
  type LifecycleStateRaw,
  type SubscriptionStateRaw,
} from "./config";
import type {
  CurrencyCode,
  LifecycleState,
  SubscriptionState,
} from "@/types/odoo-domain";

/** Odoo many2one: devuelve `[id, name]` o `false`. Extrae el id. */
export function m2oId(value: unknown): number | null {
  if (Array.isArray(value) && typeof value[0] === "number") return value[0];
  return null;
}

/** Odoo many2one: extrae el name (segundo elemento del par). */
export function m2oName(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[1] === "string") return value[1];
  return null;
}

/** Odoo devuelve `false` para campos vacíos en char/date. Normaliza a `null`. */
export function nullable<T extends string | number>(value: unknown): T | null {
  if (value === false || value == null || value === "") return null;
  return value as T;
}

/** Boolean tolerante a `false` literal de Odoo. */
export function bool(value: unknown): boolean {
  return Boolean(value);
}

export function mapCurrencyCode(currencyIdRaw: unknown): CurrencyCode | null {
  const id = m2oId(currencyIdRaw);
  if (id == null) return null;
  return currencyCodeFromId(id);
}

export function mapSubscriptionState(raw: unknown): SubscriptionState {
  switch (raw as SubscriptionStateRaw) {
    case SUBSCRIPTION_STATE.DRAFT:
      return "draft";
    case SUBSCRIPTION_STATE.RENEWAL:
      return "renewal";
    case SUBSCRIPTION_STATE.PROGRESS:
      return "progress";
    case SUBSCRIPTION_STATE.PAUSED:
      return "paused";
    case SUBSCRIPTION_STATE.CHURN:
      return "churn";
    case SUBSCRIPTION_STATE.UPSELL:
      return "upsell";
    default:
      return "draft";
  }
}

export function mapLifecycleState(raw: unknown): LifecycleState {
  switch (raw as LifecycleStateRaw) {
    case LIFECYCLE_STATE.ACTIVE:
      return "active";
    case LIFECYCLE_STATE.GRACE_PERIOD:
      return "grace_period";
    case LIFECYCLE_STATE.SUSPENDED:
      return "suspended";
    case LIFECYCLE_STATE.CANCELLED:
      return "cancelled";
    case LIFECYCLE_STATE.CHURNED:
      return "churned";
    default:
      return "active";
  }
}

/** Re-export para evitar imports doblones. */
export { CURRENCY_IDS };
