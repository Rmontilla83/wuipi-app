// ============================================================================
// WUIPI MERCANTIL SDK - Agendamiento de Cuotas
// Producto 7: Programacion de pagos recurrentes con tarjeta
// Uses 'scheduling' credentials for consult/cancel,
//       'scheduling_cards' for create (pago inicial con tarjeta)
// NOTA: Requiere pago inicial desde Boton de Pagos con Tarjetas
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints, ClientIdentify,
  CreateContractParams, CreateContractRequest, CreateContractResponse,
  ConsultContractResponse, CancelContractResponse,
} from '../types';
import { encryptField } from '../core/crypto';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Creates a recurring payment contract (agendamiento de cuotas).
 * Uses 'scheduling_cards' product credentials (pago inicial con tarjeta).
 */
export async function createContract(
  params: CreateContractParams,
  clientInfo: ClientIdentify,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<CreateContractResponse> {
  const creds = getProductCredentials(config, 'scheduling_cards');
  const body: CreateContractRequest = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: clientInfo,
    contract: {
      card_number: encryptField(params.cardNumber, creds.secretKey),
      expiry_date: encryptField(params.expiryDate, creds.secretKey),
      cvv: encryptField(params.cvv, creds.secretKey),
      name: params.cardholderName,
      customer_id: encryptField(params.customerId, creds.secretKey),
      customer_id_type: params.customerIdType,
      amount: params.amount,
      currency: params.currency || 'VES',
      frequency: params.frequency,
      start_date: params.startDate,
      ...(params.endDate && { end_date: params.endDate }),
      ...(params.description && { description: params.description }),
      invoice_number: params.invoiceNumber,
    },
  };

  const response = await apiRequest<CreateContractResponse>({
    method: 'POST',
    url: endpoints.createContractUrl,
    clientId: creds.clientId,
    body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}

/**
 * Consults an existing recurring payment contract.
 * Uses 'scheduling' product credentials.
 */
export async function consultContract(
  contractId: string,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<ConsultContractResponse> {
  const creds = getProductCredentials(config, 'scheduling');
  const body: Record<string, unknown> = {
    merchant_identify: getMerchantIdentify(config, creds),
    contract_id: contractId,
  };

  const response = await apiRequest<ConsultContractResponse>({
    method: 'POST',
    url: endpoints.consultContractUrl,
    clientId: creds.clientId,
    body,
  });
  return response.data;
}

/**
 * Cancels (anula) a recurring payment contract.
 * Uses 'scheduling' product credentials.
 */
export async function cancelContract(
  contractId: string,
  reason: string | undefined,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<CancelContractResponse> {
  const creds = getProductCredentials(config, 'scheduling');
  const body: Record<string, unknown> = {
    merchant_identify: getMerchantIdentify(config, creds),
    contract_id: contractId,
    ...(reason && { reason }),
  };

  const response = await apiRequest<CancelContractResponse>({
    method: 'POST',
    url: endpoints.cancelContractUrl,
    clientId: creds.clientId,
    body,
  });
  return response.data;
}
