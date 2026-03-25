// ============================================================================
// WUIPI MERCANTIL SDK - Agendamiento de Cuotas
// Producto 7: Programacion de pagos recurrentes con tarjeta
// Uses 'scheduling' credentials for consult/cancel,
//       'scheduling_cards' for create (pago inicial con tarjeta)
// API uses camelCase: merchantIdentify, clientIdentify, ipAddress, browserAgent
// Docs: https://apiportal.mercantilbanco.com/mercantil-banco/produccion/product/26229
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints,
  CreateContractParams, CreateContractResponse,
  ConsultContractResponse, CancelContractResponse,
} from '../types';
import { encryptTransactionData, encryptField } from '../core/crypto';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { apiRequest } from '../core/http';

/**
 * Creates a recurring payment contract (agendamiento de cuotas).
 * Uses 'scheduling_cards' product credentials.
 * The installment data is JSON.stringified then AES-encrypted into installmentValue.
 */
export async function createContract(
  params: CreateContractParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<CreateContractResponse> {
  const creds = getProductCredentials(config, 'scheduling_cards');

  // Build the installment data object (will be encrypted as a whole)
  const installmentData = {
    contractNumber: params.contractNumber || 'TDC',
    customerId: params.customerId,
    customerName: params.cardholderName,
    customerEmail: params.customerEmail || '',
    cardNumber: params.cardNumber,
    accountNumber: params.accountNumber || '',
    expirationDate: params.expiryDate,
    paymentMethod: params.paymentMethod || 'TDD',
    paymentReference: params.paymentReference,
    contractStatus: 2,
    numberCollectionAttempts: params.collectionAttempts || 3,
    collectionInForeignCurrency: 'N',
    amountToFinance: params.amount,
    numberInstallments: params.installments.length,
    paymentFrecuency: params.frequency,
    firstPaymentDate: params.startDate,
    currency: params.currency || 'VES',
    installmentsInfo: params.installments,
  };

  const body = {
    merchantIdentify: getMerchantIdentify(config, creds),
    clientIdentify: {
      ipAddress: '127.0.0.1',
      browserAgent: 'Mozilla/5.0',
      mobile: { manufacturer: 'Server' },
    },
    installmentCreationEncrypted: {
      installmentValue: encryptTransactionData(installmentData, creds.secretKey),
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
 * Node: "consultContract" with encrypted contractNumber.
 */
export async function consultContract(
  contractNumber: string,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<ConsultContractResponse> {
  const creds = getProductCredentials(config, 'scheduling');
  const body = {
    merchantIdentify: getMerchantIdentify(config, creds),
    clientIdentify: {
      ipAddress: '127.0.0.1',
      browserAgent: 'Mozilla/5.0',
      mobile: { manufacturer: 'Server' },
    },
    consultContract: {
      contractNumber: encryptField(contractNumber, creds.secretKey),
    },
  };

  const response = await apiRequest<ConsultContractResponse>({
    method: 'POST',
    url: endpoints.consultContractUrl,
    clientId: creds.clientId,
    body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}

/**
 * Cancels (anula) a recurring payment contract.
 * Uses 'scheduling' product credentials.
 * Node: "cancelContract" with encrypted contractNumber + cancellationReason.
 */
export async function cancelContract(
  contractNumber: string,
  cancellationReason: number,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<CancelContractResponse> {
  const creds = getProductCredentials(config, 'scheduling');
  const body = {
    merchantIdentify: getMerchantIdentify(config, creds),
    clientIdentify: {
      ipAddress: '127.0.0.1',
      browserAgent: 'Mozilla/5.0',
      mobile: { manufacturer: 'Server' },
    },
    cancelContract: {
      contractNumber: encryptField(contractNumber, creds.secretKey),
      cancellationReason,
    },
  };

  const response = await apiRequest<CancelContractResponse>({
    method: 'POST',
    url: endpoints.cancelContractUrl,
    clientId: creds.clientId,
    body: body as unknown as Record<string, unknown>,
  });
  return response.data;
}
