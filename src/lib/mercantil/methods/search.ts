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
import { getProductCredentials } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Search bank transfers received (Debito Inmediato + interbancarias).
 * Uses 'transfer_search' product credentials — DIFFERENT clientId from other products.
 */
export async function searchTransfers(
  params: TransferSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TransferSearchResult[]> {
  const creds = getProductCredentials(config, 'transfer_search');
  const body: Record<string, unknown> = {
    merchant_id: creds.merchantId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  if (params.amount) body.amount = params.amount.toFixed(2);

  const response = await apiRequest<{ transactions: TransferSearchResult[] }>({
    method: 'POST', url: endpoints.searchTransfersUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search mobile payments (C2P, P2C, Vuelto) via Tpago.
 * Uses 'mobile_search' product credentials.
 */
export async function searchMobilePayments(
  params: MobilePaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const creds = getProductCredentials(config, 'mobile_search');
  const body: Record<string, unknown> = {
    merchant_id: creds.merchantId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  if (params.transactionType) body.transaction_type = params.transactionType;

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchMobilePaymentsUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search card payment transactions (TDC/TDD).
 * Uses 'card_search' product credentials.
 */
export async function searchCardPayments(
  params: CardPaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const creds = getProductCredentials(config, 'card_search');
  const body: Record<string, unknown> = {
    merchant_id: creds.merchantId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  if (params.cardType) body.card_type = params.cardType;

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchCardPaymentsUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}
