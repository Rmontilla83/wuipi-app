// WUIPI MERCANTIL SDK - Webhook Handler
import type { WebhookPayload, WebhookHandler, MercantilConfig } from '../types';
import { decryptTransactionData } from '../core/crypto';

export interface WebhookHandlers {
  onApproved?: WebhookHandler;
  onDeclined?: WebhookHandler;
  onError?: WebhookHandler;
  onPending?: WebhookHandler;
  onAny?: WebhookHandler;
}

export function parseWebhookPayload(
  rawBody: string | Record<string, unknown>,
  config: MercantilConfig
): WebhookPayload {
  let payload: WebhookPayload;

  if (typeof rawBody === 'string') {
    try {
      payload = decryptTransactionData<WebhookPayload>(rawBody, config.secretKey);
    } catch {
      payload = JSON.parse(rawBody) as WebhookPayload;
    }
  } else if (rawBody.transactionData && typeof rawBody.transactionData === 'string') {
    payload = decryptTransactionData<WebhookPayload>(
      rawBody.transactionData, config.secretKey
    );
    payload.raw = rawBody;
  } else {
    payload = rawBody as unknown as WebhookPayload;
  }

  if (!payload.status || !payload.invoice_number) {
    throw new Error('[MercantilSDK] Invalid webhook: missing status or invoice_number');
  }
  return payload;
}

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
