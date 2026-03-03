// ============================================================================
// WUIPI MERCANTIL SDK - Main Entry Point
// Unified client for all Mercantil payment operations
// ============================================================================

import type {
  MercantilConfig, WebPaymentButtonParams, WebPaymentButtonResponse,
  CardAuthResponse, CardPayResponse, C2PPaymentResponse,
  TransferSearchParams, TransferSearchResult,
  MobilePaymentSearchParams, CardPaymentSearchParams,
  ClientIdentify, WebhookPayload,
} from './types';
import { resolveConfig, configFromEnv, type ResolvedConfig } from './core/config';
import { encrypt, decrypt, encryptField, validateSecretKey } from './core/crypto';
import { createWebPayment, createInvoicePayment } from './methods/web-payment';
import { authenticateCard, submitCardPayment } from './methods/card-payment';
import { createC2PPayment } from './methods/c2p-payment';
import { searchTransfers, searchMobilePayments, searchCardPayments } from './methods/search';
import { createWebhookProcessor, parseWebhookPayload, type WebhookHandlers } from './webhooks/handler';

export class MercantilSDK {
  private resolved: ResolvedConfig;

  constructor(config?: MercantilConfig) {
    const cfg = config || configFromEnv();
    this.resolved = resolveConfig(cfg);
  }

  get config() { return this.resolved.config; }
  get endpoints() { return this.resolved.endpoints; }
  /** true if all credentials are present and valid */
  get isConfigured() { return this.resolved.isConfigured; }

  /** Throws if SDK is not configured with valid credentials */
  private ensureConfigured() {
    if (!this.resolved.isConfigured) {
      throw new Error(
        '[MercantilSDK] SDK not configured. Provide valid credentials via environment variables.'
      );
    }
  }

  // --- Web Payment Button (Unified: Debito + Tarjetas + C2P) ---

  createPayment(params: WebPaymentButtonParams): WebPaymentButtonResponse {
    this.ensureConfigured();
    return createWebPayment(params, this.config, this.endpoints);
  }

  createInvoicePayment(invoiceNumber: string, amount: number, email: string): WebPaymentButtonResponse {
    this.ensureConfigured();
    return createInvoicePayment(invoiceNumber, amount, email, this.config, this.endpoints);
  }

  // --- Card Payments (2-step) ---

  async authenticateCard(
    cardNumber: string, name: string, customerId: string,
    idType: string, clientInfo: ClientIdentify
  ): Promise<CardAuthResponse> {
    this.ensureConfigured();
    return authenticateCard(cardNumber, name, customerId, idType, clientInfo, this.config, this.endpoints);
  }

  async submitCardPayment(
    params: Parameters<typeof submitCardPayment>[0],
    clientInfo: ClientIdentify
  ): Promise<CardPayResponse> {
    this.ensureConfigured();
    return submitCardPayment(params, clientInfo, this.config, this.endpoints);
  }

  // --- C2P Mobile Payments ---

  async createC2PPayment(
    params: Parameters<typeof createC2PPayment>[0],
    clientInfo: ClientIdentify
  ): Promise<C2PPaymentResponse> {
    this.ensureConfigured();
    return createC2PPayment(params, clientInfo, this.config, this.endpoints);
  }

  // --- Search / Reconciliation ---

  async searchTransfers(params: TransferSearchParams): Promise<TransferSearchResult[]> {
    this.ensureConfigured();
    return searchTransfers(params, this.config, this.endpoints);
  }

  async searchMobilePayments(params: MobilePaymentSearchParams) {
    this.ensureConfigured();
    return searchMobilePayments(params, this.config, this.endpoints);
  }

  async searchCardPayments(params: CardPaymentSearchParams) {
    this.ensureConfigured();
    return searchCardPayments(params, this.config, this.endpoints);
  }

  // --- Webhooks ---

  createWebhookProcessor(handlers: WebhookHandlers) {
    this.ensureConfigured();
    return createWebhookProcessor(this.config, handlers);
  }

  parseWebhook(rawBody: string | Record<string, unknown>): WebhookPayload {
    this.ensureConfigured();
    return parseWebhookPayload(rawBody, this.config);
  }

  // --- Encryption utilities ---

  encrypt(plaintext: string): string { this.ensureConfigured(); return encrypt(plaintext, this.config.secretKey); }
  decrypt(ciphertext: string): string { this.ensureConfigured(); return decrypt(ciphertext, this.config.secretKey); }
  encryptField(value: string): string { this.ensureConfigured(); return encryptField(value, this.config.secretKey); }
}

// Re-export everything
export { configFromEnv, resolveConfig } from './core/config';
export { encrypt, decrypt, encryptField, encryptTransactionData, decryptTransactionData, validateSecretKey } from './core/crypto';
export { createWebPayment, createInvoicePayment } from './methods/web-payment';
export { authenticateCard, submitCardPayment } from './methods/card-payment';
export { createC2PPayment } from './methods/c2p-payment';
export { searchTransfers, searchMobilePayments, searchCardPayments } from './methods/search';
export { createWebhookProcessor, parseWebhookPayload } from './webhooks/handler';
export * from './types';
export * from './utils/helpers';

export default MercantilSDK;
