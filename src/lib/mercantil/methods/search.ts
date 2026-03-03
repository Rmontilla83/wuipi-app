// ============================================================================
// WUIPI MERCANTIL SDK - APIs de Busqueda (Reconciliation)
// Busqueda de: Transferencias, Pagos Moviles, Pagos con Tarjetas
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints, TransferSearchParams,
  TransferSearchResult, MobilePaymentSearchParams, CardPaymentSearchParams,
} from '../types';
import { apiRequest } from '../core/http';

/**
 * Search bank transfers received (Debito Inmediato + interbancarias).
 */
export async function searchTransfers(
  params: TransferSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TransferSearchResult[]> {
  const body: Record<string, unknown> = {
    merchant_id: config.merchantId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  if (params.amount) body.amount = params.amount.toFixed(2);

  const response = await apiRequest<{ transactions: TransferSearchResult[] }>({
    method: 'POST', url: endpoints.searchTransfersUrl,
    clientId: config.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search mobile payments (C2P, P2C, Vuelto) via Tpago.
 */
export async function searchMobilePayments(
  params: MobilePaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const body: Record<string, unknown> = {
    merchant_id: config.merchantId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  if (params.transactionType) body.transaction_type = params.transactionType;

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchMobilePaymentsUrl,
    clientId: config.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search card payment transactions (TDC/TDD).
 */
export async function searchCardPayments(
  params: CardPaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const body: Record<string, unknown> = {
    merchant_id: config.merchantId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
  };
  if (params.paymentReference) body.payment_reference = params.paymentReference;
  if (params.cardType) body.card_type = params.cardType;

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchCardPaymentsUrl,
    clientId: config.clientId, body,
  });
  return response.data.transactions || [];
}
