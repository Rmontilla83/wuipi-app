// ============================================================================
// WUIPI MERCANTIL SDK - APIs de Busqueda (Reconciliation)
// Productos 4/5/6: Busqueda de Tarjetas, Movil, Transferencias
// IMPORTANT: Each search type uses DIFFERENT product credentials!
//   - card_search: Producto 4
//   - mobile_search: Producto 5
//   - transfer_search: Producto 6 (DIFFERENT clientId: 17ebe62d...)
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints, TransferSearchParams,
  TransferSearchResult, MobilePaymentSearchParams, CardPaymentSearchParams,
} from '../types';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { encryptField } from '../core/crypto';
import { apiRequest } from '../core/http';

/**
 * Search bank transfers received (Debito Inmediato + interbancarias).
 * Uses 'transfer_search' product credentials — DIFFERENT clientId from other products.
 * Node name is "transferSearchBy" (confirmed by Mercantil).
 * Sensitive fields (account, issuerCustomerId) are encrypted with AES-128/ECB.
 */
export async function searchTransfers(
  params: TransferSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TransferSearchResult[]> {
  const creds = getProductCredentials(config, 'transfer_search');
  // Per-product baseUrl lets transfer_search run in prod while the rest of
  // the SDK (e.g. web_button) remains in sandbox until its prod creds land.
  const url = creds.baseUrl
    ? `${creds.baseUrl.replace(/\/$/, '')}/v1/payment/transfer-search`
    : endpoints.searchTransfersUrl;
  const body: Record<string, unknown> = {
    merchantIdentify: getMerchantIdentify(config, creds),
    clientIdentify: {
      ipAddress: '127.0.0.1',
      browserAgent: 'Mozilla/5.0',
    },
    transferSearchBy: {
      account: encryptField(params.account, creds.secretKey),
      issuerCustomerId: encryptField(params.issuerCustomerId, creds.secretKey),
      trxDate: params.trxDate,
      issuerBankId: params.issuerBankId,
      transactionType: params.transactionType,
      paymentReference: params.paymentReference,
      amount: params.amount,
    },
  };

  const response = await apiRequest<{ transactions: TransferSearchResult[] }>({
    method: 'POST', url,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search mobile payments (C2P, P2C, Vuelto) via Tpago.
 * Uses 'mobile_search' product credentials.
 * Postman/playground: snake_case, node "search_by".
 * Phone numbers are ENCRYPTED. trx_date format: YYYY-MM-DD (hyphens).
 */
export async function searchMobilePayments(
  params: MobilePaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const creds = getProductCredentials(config, 'mobile_search');
  const body: Record<string, unknown> = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: {
      ipaddress: '127.0.0.1',
      browser_agent: 'Mozilla/5.0',
    },
    search_by: {
      trx_date: params.trxDate,
      payment_reference: params.paymentReference || '',
      amount: params.amount || 0,
      currency: 'ves',
      destination_mobile_number: params.destinationMobile
        ? encryptField(params.destinationMobile, creds.secretKey) : '',
      origin_mobile_number: params.originMobile
        ? encryptField(params.originMobile, creds.secretKey) : '',
    },
  };

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchMobilePaymentsUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search card payment transactions (TDC/TDD).
 * Uses 'card_search' product credentials.
 * Postman: snake_case, node "search_by" with procesing_date (1 's'),
 * integratorId/merchantId as strings.
 */
export async function searchCardPayments(
  params: CardPaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const creds = getProductCredentials(config, 'card_search');
  const body: Record<string, unknown> = {
    merchant_identify: {
      integratorId: String(config.integratorId),
      merchantId: creds.merchantId,
      terminalId: config.terminalId,
    },
    client_identify: {
      ipaddress: '127.0.0.1',
      browser_agent: 'Mozilla/5.0',
    },
    search_by: {
      search_criteria: params.searchCriteria || 'unique',
      procesing_date: params.processingDate.replace(/-/g, '/'),
      invoice_number: params.invoiceNumber || '',
      payment_reference: params.paymentReference || '',
    },
  };

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchCardPaymentsUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}
