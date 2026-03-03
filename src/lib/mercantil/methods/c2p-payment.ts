// ============================================================================
// WUIPI MERCANTIL SDK - Pago Movil C2P (Commerce to Person)
// Cobros interbancarios directos via Pago Movil
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints, C2PPaymentRequest,
  C2PPaymentResponse, ClientIdentify,
} from '../types';
import { encryptField } from '../core/crypto';
import { getMerchantIdentify } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Initiates a C2P (Commerce to Person) mobile payment.
 */
export async function createC2PPayment(
  params: {
    amount: number;
    destinationBankId: string;
    destinationId: string;
    originMobile: string;
    destinationMobile: string;
    invoiceNumber: string;
    trxType?: 'compra' | 'vuelto';
  },
  clientInfo: ClientIdentify,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<C2PPaymentResponse> {
  const body: C2PPaymentRequest = {
    merchant_identify: getMerchantIdentify(config),
    client_identify: clientInfo,
    transaction_c2p: {
      amount: params.amount,
      currency: 'ves',
      destination_bank_id: params.destinationBankId,
      destination_id: encryptField(params.destinationId, config.secretKey),
      origin_mobile_number: encryptField(params.originMobile, config.secretKey),
      destination_mobile_number: encryptField(params.destinationMobile, config.secretKey),
      trx_type: params.trxType || 'compra',
      payment_method: 'c2p',
      invoice_number: params.invoiceNumber,
    },
  };

  const response = await apiRequest<C2PPaymentResponse>({
    method: 'POST', url: endpoints.c2pUrl,
    clientId: config.clientId, body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}
