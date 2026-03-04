// ============================================================================
// WUIPI MERCANTIL SDK - Webhook Handler
// Processes payment notifications from Banco Mercantil
// Supports multi-key decryption (different products use different secretKeys)
// ============================================================================

import type { WebhookPayload, WebhookHandler, MercantilConfig } from '../types';
import { decryptTransactionData } from '../core/crypto';
import { getAllSecretKeys } from '../core/config';

export interface WebhookHandlers {
  onApproved?: WebhookHandler;
  onDeclined?: WebhookHandler;
  onError?: WebhookHandler;
  onPending?: WebhookHandler;
  onAny?: WebhookHandler;
}

/**
 * Parses and decrypts a webhook payload from Mercantil.
 * Tries all known secret keys since different products use different encryption keys.
 * There are only ~3 unique keys so iteration is fast.
 */
export function parseWebhookPayload(
  rawBody: string | Record<string, unknown>,
  config: MercantilConfig
): WebhookPayload {
  const secretKeys = getAllSecretKeys(config);
  let payload: WebhookPayload | null = null;

  if (typeof rawBody === 'string') {
    // Try decrypting with each secret key
    for (const key of secretKeys) {
      try {
        payload = decryptTransactionData<WebhookPayload>(rawBody, key);
        break;
      } catch {
        continue;
      }
    }
    // If no key worked, try parsing as plain JSON
    if (!payload) {
      try {
        payload = JSON.parse(rawBody) as WebhookPayload;
      } catch {
        throw new Error(
          '[MercantilSDK] No se pudo descifrar el webhook con ninguna clave disponible'
        );
      }
    }
  } else if (rawBody.transactionData && typeof rawBody.transactionData === 'string') {
    // Encrypted transactionData field
    for (const key of secretKeys) {
      try {
        payload = decryptTransactionData<WebhookPayload>(
          rawBody.transactionData, key
        );
        payload.raw = rawBody;
        break;
      } catch {
        continue;
      }
    }
    if (!payload) {
      throw new Error(
        '[MercantilSDK] No se pudo descifrar transactionData con ninguna clave disponible'
      );
    }
  } else {
    // Plain JSON payload
    payload = rawBody as unknown as WebhookPayload;
  }

  if (!payload || !payload.status || !payload.invoice_number) {
    throw new Error('[MercantilSDK] Webhook invalido: falta status o invoice_number');
  }
  return payload;
}

/**
 * Creates a webhook processor that parses the payload and routes to handlers.
 */
export function createWebhookProcessor(
  config: MercantilConfig,
  handlers: WebhookHandlers
) {
  return async (rawBody: string | Record<string, unknown>) => {
    const payload = parseWebhookPayload(rawBody, config);
    if (handlers.onAny) await handlers.onAny(payload);
    const h = handlers;
    if (payload.status === 'approved' && h.onApproved) await h.onApproved(payload);
    if (payload.status === 'declined' && h.onDeclined) await h.onDeclined(payload);
    if (payload.status === 'error' && h.onError) await h.onError(payload);
    if (payload.status === 'pending' && h.onPending) await h.onPending(payload);
    return payload;
  };
}
