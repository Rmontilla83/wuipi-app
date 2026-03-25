// ============================================================================
// WUIPI MERCANTIL SDK - Pago Movil C2P (Commerce to Person)
// Producto 2: Cobros interbancarios directos via Pago Movil
// Uses 'c2p_payment' product credentials
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints, C2PPaymentRequest,
  C2PPaymentResponse, ClientIdentify,
} from '../types';
import { encryptField } from '../core/crypto';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Initiates a C2P (Commerce to Person) mobile payment.
 */
/**
 * Initiates a C2P (Commerce to Person) mobile payment.
 * Postman: node "transaction_c2p", destination_bank_id as number,
 * twofactor_auth encrypted (OTP/purchaseKey).
 */
export async function createC2PPayment(
  params: {
    amount: number;
    destinationBankId: string | number;
    destinationId: string;
    originMobile: string;
    destinationMobile: string;
    invoiceNumber: string;
    trxType?: 'compra' | 'vuelto';
    purchaseKey?: string;
  },
  clientInfo: ClientIdentify,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<C2PPaymentResponse> {
  const creds = getProductCredentials(config, 'c2p_payment');
  const bankId = typeof params.destinationBankId === 'string'
    ? parseInt(params.destinationBankId, 10) || params.destinationBankId
    : params.destinationBankId;
  const body = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    transaction_c2p: {
      amount: params.amount,
      currency: 'ves',
      destination_bank_id: bankId,
      destination_id: encryptField(params.destinationId, creds.secretKey),
      origin_mobile_number: encryptField(params.originMobile, creds.secretKey),
      destination_mobile_number: encryptField(params.destinationMobile, creds.secretKey),
      trx_type: params.trxType || 'compra',
      payment_method: params.trxType === 'vuelto' ? 'p2p' : 'c2p',
      invoice_number: params.invoiceNumber,
      twofactor_auth: params.purchaseKey ? encryptField(params.purchaseKey, creds.secretKey) : '',
      payment_reference: '',
    },
  };

  const response = await apiRequest<C2PPaymentResponse>({
    method: 'POST', url: endpoints.c2pUrl,
    clientId: creds.clientId, body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}
