// ============================================================================
// WUIPI MERCANTIL SDK - Pagos con Tarjetas (2-step: Auth then Pay)
// Producto 1: Supports Visa, Mastercard, Diners, Maestro (credito y debito)
// Uses 'card_payment' product credentials
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints, CardAuthRequest,
  CardAuthResponse, CardPayRequest, CardPayResponse, ClientIdentify,
} from '../types';
import { encryptField } from '../core/crypto';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Step 1: Request card authentication (solicitud de autenticación).
 * Postman node: "transaction_authInfo" with trx_type="solaut".
 * customer_id and card_number are sent as PLAIN TEXT (not encrypted).
 * customer_id format: "V12345678" (prefix + number).
 */
export async function authenticateCard(
  cardNumber: string, _cardholderName: string, customerId: string,
  customerIdType: string, clientInfo: ClientIdentify,
  config: MercantilConfig, endpoints: MercantilEndpoints
): Promise<CardAuthResponse> {
  const creds = getProductCredentials(config, 'card_payment');
  const paymentMethod = cardNumber.startsWith('4') || cardNumber.startsWith('5') ? 'tdd' : 'tdc';
  const body = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    transaction_authInfo: {
      trx_type: 'solaut',
      payment_method: paymentMethod,
      customer_id: `${customerIdType}${customerId}`,
      card_number: cardNumber,
    },
  };
  const response = await apiRequest<CardAuthResponse>({
    method: 'POST', url: endpoints.cardAuthUrl,
    clientId: creds.clientId, body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}

export async function submitCardPayment(
  params: {
    cardNumber: string; expiryDate: string; cvv: string;
    cardholderName: string; customerId: string; customerIdType: string;
    amount: number; currency: string; authCode: string;
    authReference: string; invoiceNumber: string; cardType: 'credit' | 'debit';
  },
  clientInfo: ClientIdentify, config: MercantilConfig, endpoints: MercantilEndpoints
): Promise<CardPayResponse> {
  const creds = getProductCredentials(config, 'card_payment');
  const paymentMethod = params.cardType === 'debit' ? 'tdd' : 'tdc';
  const body = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    transaction: {
      trx_type: 'compra',
      payment_method: paymentMethod,
      card_number: encryptField(params.cardNumber, creds.secretKey),
      customer_id: encryptField(params.customerId, creds.secretKey),
      expiration_date: encryptField(params.expiryDate, creds.secretKey),
      cvv: encryptField(params.cvv, creds.secretKey),
      currency: params.currency || 'ves',
      amount: params.amount,
      invoice_number: params.invoiceNumber,
      twofactor_auth: params.authCode ? encryptField(params.authCode, creds.secretKey) : '',
      ...(paymentMethod === 'tdd' && { account_type: 'cc' }),
    },
  };
  const response = await apiRequest<CardPayResponse>({
    method: 'POST', url: endpoints.cardPayUrl,
    clientId: creds.clientId, body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}
