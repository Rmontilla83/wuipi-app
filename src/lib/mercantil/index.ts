// ============================================================================
// WUIPI MERCANTIL SDK - Main Entry Point
// Unified client for all Mercantil payment operations
// Multi-Product Credentials Architecture
// ============================================================================

import type {
  MercantilConfig, MercantilProduct, WebPaymentButtonParams,
  WebPaymentButtonResponse, CardAuthResponse, CardPayResponse,
  C2PPaymentResponse, C2PKeyResponse, TransferSearchParams,
  TransferSearchResult, MobilePaymentSearchParams, CardPaymentSearchParams,
  CreateContractParams, CreateContractResponse, ConsultContractResponse,
  CancelContractResponse, TedUploadParams, TedUploadResponse,
  TedDownloadParams, TedDownloadResponse, TedListMailboxParams,
  TedListMailboxResponse, TedListBatchParams, TedListBatchResponse,
  ClientIdentify, WebhookPayload,
} from './types';
import {
  resolveConfig, configFromEnv, getProductCredentials,
  type ResolvedConfig,
} from './core/config';
import { encrypt, decrypt, encryptField } from './core/crypto';
import { createWebPayment, createInvoicePayment } from './methods/web-payment';
import { authenticateCard, submitCardPayment } from './methods/card-payment';
import { createC2PPayment } from './methods/c2p-payment';
import { requestC2PKey } from './methods/c2p-key-request';
import { searchTransfers, searchMobilePayments, searchCardPayments } from './methods/search';
import { createContract, consultContract, cancelContract } from './methods/scheduling';
import { tedUpload, tedDownload, tedListMailbox, tedListBatch } from './methods/ted';
import { createWebhookProcessor, parseWebhookPayload, type WebhookHandlers } from './webhooks/handler';

export class MercantilSDK {
  private resolved: ResolvedConfig;

  constructor(config?: MercantilConfig) {
    const cfg = config || configFromEnv();
    this.resolved = resolveConfig(cfg);
  }

  get config() { return this.resolved.config; }
  get endpoints() { return this.resolved.endpoints; }
  get configuredProducts() { return this.resolved.configuredProducts; }

  /** Check if a specific product is configured */
  isProductConfigured(product: MercantilProduct): boolean {
    return this.resolved.configuredProducts.has(product);
  }

  /** Check if ANY product is configured */
  get isConfigured(): boolean {
    return this.resolved.configuredProducts.size > 0;
  }

  /** Throws if the specified product is not configured */
  private ensureProduct(product: MercantilProduct): void {
    if (!this.resolved.configuredProducts.has(product)) {
      throw new Error(
        `[MercantilSDK] Producto "${product}" no configurado. ` +
        'Verifique las variables de entorno correspondientes.'
      );
    }
  }

  // --- Web Payment Button (Producto 9 — PENDIENTE) ---

  createPayment(params: WebPaymentButtonParams): WebPaymentButtonResponse {
    this.ensureProduct('web_button');
    return createWebPayment(params, this.config, this.endpoints);
  }

  createInvoicePayment(invoiceNumber: string, amount: number, email: string): WebPaymentButtonResponse {
    this.ensureProduct('web_button');
    return createInvoicePayment(invoiceNumber, amount, email, this.config, this.endpoints);
  }

  // --- Card Payments (Producto 1) ---

  async authenticateCard(
    cardNumber: string, name: string, customerId: string,
    idType: string, clientInfo: ClientIdentify
  ): Promise<CardAuthResponse> {
    this.ensureProduct('card_payment');
    return authenticateCard(cardNumber, name, customerId, idType, clientInfo, this.config, this.endpoints);
  }

  async submitCardPayment(
    params: Parameters<typeof submitCardPayment>[0],
    clientInfo: ClientIdentify
  ): Promise<CardPayResponse> {
    this.ensureProduct('card_payment');
    return submitCardPayment(params, clientInfo, this.config, this.endpoints);
  }

  // --- C2P Mobile Payments (Producto 2) ---

  async createC2PPayment(
    params: Parameters<typeof createC2PPayment>[0],
    clientInfo: ClientIdentify
  ): Promise<C2PPaymentResponse> {
    this.ensureProduct('c2p_payment');
    return createC2PPayment(params, clientInfo, this.config, this.endpoints);
  }

  // --- C2P Key Request (Producto 3) ---

  async requestC2PKey(
    params: Parameters<typeof requestC2PKey>[0],
    clientInfo: ClientIdentify
  ): Promise<C2PKeyResponse> {
    this.ensureProduct('c2p_key_request');
    return requestC2PKey(params, clientInfo, this.config, this.endpoints);
  }

  // --- Search / Reconciliation (Productos 4/5/6) ---

  async searchTransfers(params: TransferSearchParams): Promise<TransferSearchResult[]> {
    this.ensureProduct('transfer_search');
    return searchTransfers(params, this.config, this.endpoints);
  }

  async searchMobilePayments(params: MobilePaymentSearchParams) {
    this.ensureProduct('mobile_search');
    return searchMobilePayments(params, this.config, this.endpoints);
  }

  async searchCardPayments(params: CardPaymentSearchParams) {
    this.ensureProduct('card_search');
    return searchCardPayments(params, this.config, this.endpoints);
  }

  // --- Scheduling (Producto 7) ---

  async createContract(
    params: CreateContractParams,
    clientInfo: ClientIdentify
  ): Promise<CreateContractResponse> {
    this.ensureProduct('scheduling_cards');
    return createContract(params, clientInfo, this.config, this.endpoints);
  }

  async consultContract(contractId: string): Promise<ConsultContractResponse> {
    this.ensureProduct('scheduling');
    return consultContract(contractId, this.config, this.endpoints);
  }

  async cancelContract(contractId: string, reason?: string): Promise<CancelContractResponse> {
    this.ensureProduct('scheduling');
    return cancelContract(contractId, reason, this.config, this.endpoints);
  }

  // --- TED (Producto 8) ---

  async tedUpload(params: TedUploadParams): Promise<TedUploadResponse> {
    this.ensureProduct('ted');
    return tedUpload(params, this.config, this.endpoints);
  }

  async tedDownload(params: TedDownloadParams): Promise<TedDownloadResponse> {
    this.ensureProduct('ted');
    return tedDownload(params, this.config, this.endpoints);
  }

  async tedListMailbox(params?: TedListMailboxParams): Promise<TedListMailboxResponse> {
    this.ensureProduct('ted');
    return tedListMailbox(params || {}, this.config, this.endpoints);
  }

  async tedListBatch(params?: TedListBatchParams): Promise<TedListBatchResponse> {
    this.ensureProduct('ted');
    return tedListBatch(params || {}, this.config, this.endpoints);
  }

  // --- Webhooks ---

  createWebhookProcessor(handlers: WebhookHandlers) {
    return createWebhookProcessor(this.config, handlers);
  }

  parseWebhook(rawBody: string | Record<string, unknown>): WebhookPayload {
    return parseWebhookPayload(rawBody, this.config);
  }

  // --- Encryption utilities (per-product) ---

  encrypt(plaintext: string, product: MercantilProduct): string {
    const creds = getProductCredentials(this.config, product);
    return encrypt(plaintext, creds.secretKey);
  }

  decrypt(ciphertext: string, product: MercantilProduct): string {
    const creds = getProductCredentials(this.config, product);
    return decrypt(ciphertext, creds.secretKey);
  }

  encryptField(value: string, product: MercantilProduct): string {
    const creds = getProductCredentials(this.config, product);
    return encryptField(value, creds.secretKey);
  }
}

// Re-export everything
export { configFromEnv, resolveConfig, getProductCredentials, getAllSecretKeys } from './core/config';
export { encrypt, decrypt, encryptField, encryptTransactionData, decryptTransactionData, validateSecretKey } from './core/crypto';
export { createWebPayment, createInvoicePayment } from './methods/web-payment';
export { authenticateCard, submitCardPayment } from './methods/card-payment';
export { createC2PPayment } from './methods/c2p-payment';
export { requestC2PKey } from './methods/c2p-key-request';
export { searchTransfers, searchMobilePayments, searchCardPayments } from './methods/search';
export { createContract, consultContract, cancelContract } from './methods/scheduling';
export { tedUpload, tedDownload, tedListMailbox, tedListBatch } from './methods/ted';
export { createWebhookProcessor, parseWebhookPayload } from './webhooks/handler';
export * from './types';
export * from './utils/helpers';

export default MercantilSDK;
