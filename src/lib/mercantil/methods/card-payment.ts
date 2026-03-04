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

export async function authenticateCard(
  cardNumber: string, cardholderName: string, customerId: string,
  customerIdType: string, clientInfo: ClientIdentify,
  config: MercantilConfig, endpoints: MercantilEndpoints
): Promise<CardAuthResponse> {
  const creds = getProductCredentials(config, 'card_payment');
  const body: CardAuthRequest = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    card_holder: {
      card_number: encryptField(cardNumber, creds.secretKey),
      name: cardholderName,
      customer_id: encryptField(customerId, creds.secretKey),
      customer_id_type: customerIdType,
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
  const body: CardPayRequest = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    card_payment: {
      card_number: encryptField(params.cardNumber, creds.secretKey),
      expiry_date: encryptField(params.expiryDate, creds.secretKey),
      cvv: encryptField(params.cvv, creds.secretKey),
      name: params.cardholderName,
      customer_id: encryptField(params.customerId, creds.secretKey),
      customer_id_type: params.customerIdType,
      amount: params.amount, currency: params.currency || 'VES',
      auth_code: params.authCode, auth_reference: params.authReference,
      invoice_number: params.invoiceNumber, card_type: params.cardType,
    },
  };
  const response = await apiRequest<CardPayResponse>({
    method: 'POST', url: endpoints.cardPayUrl,
    clientId: creds.clientId, body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}
