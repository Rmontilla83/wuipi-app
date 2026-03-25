// ============================================================================
// WUIPI MERCANTIL SDK - Solicitud de Clave C2P
// Producto 3: Solicita clave de pago movil para transacciones C2P
// Uses 'c2p_key_request' product credentials
// Endpoint: /v1/mobile-payment/scp
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints,
  C2PKeyRequestPayload, C2PKeyResponse, ClientIdentify,
} from '../types';
import { encryptField } from '../core/crypto';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Requests a C2P payment key (clave de compra) for mobile payment.
 * The key is sent to the customer's mobile number via SMS.
 */
/**
 * Requests a C2P payment key (clave de compra) for mobile payment.
 * Postman node: "transaction_scpInfo" with destination_id and destination_mobile_number.
 */
export async function requestC2PKey(
  params: {
    destinationId: string;
    destinationMobile: string;
  },
  clientInfo: ClientIdentify,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<C2PKeyResponse> {
  const creds = getProductCredentials(config, 'c2p_key_request');
  const body = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    transaction_scpInfo: {
      destination_id: encryptField(params.destinationId, creds.secretKey),
      destination_mobile_number: encryptField(params.destinationMobile, creds.secretKey),
    },
  };

  const response = await apiRequest<C2PKeyResponse>({
    method: 'POST',
    url: endpoints.c2pKeyRequestUrl,
    clientId: creds.clientId,
    body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}
