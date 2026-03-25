// ============================================================================
// WUIPI MERCANTIL SDK - Transmision Electronica de Datos (TED)
// Producto 8: Carga/descarga de archivos y consulta de buzones
// Uses 'ted' product credentials
// Numero de persona: 11103402
// ============================================================================

import type {
  MercantilConfig, MercantilEndpoints,
  TedUploadParams, TedUploadResponse,
  TedDownloadParams, TedDownloadResponse,
  TedListMailboxParams, TedListMailboxResponse,
  TedListBatchParams, TedListBatchResponse,
} from '../types';
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { encryptField } from '../core/crypto';
import { apiRequest } from '../core/http';

/**
 * Common TED request structure.
 * TED uses camelCase (merchantIdentify) but ipaddress (lowercase).
 */
function tedBaseBody(config: MercantilConfig) {
  const creds = getProductCredentials(config, 'ted');
  return {
    merchantIdentify: getMerchantIdentify(config, creds),
    clientIdentify: {
      ipaddress: '127.0.0.1',
      browserAgent: 'Mozilla/5.0',
      mobile: { manufacturer: 'Server' },
    },
  };
}

/**
 * Lists the TED mailbox (listar buzon).
 * Postman: camelCase, nodes inboxType (encrypted) and clientId.
 */
export async function tedListMailbox(
  params: TedListMailboxParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TedListMailboxResponse> {
  const creds = getProductCredentials(config, 'ted');
  const body: Record<string, unknown> = {
    ...tedBaseBody(config),
    inboxType: encryptField(params.inboxType || 'entrada', creds.secretKey),
    clientId: creds.merchantId,
  };

  const response = await apiRequest<TedListMailboxResponse>({
    method: 'POST',
    url: endpoints.tedListMailboxUrl,
    clientId: creds.clientId,
    body,
  });
  return response.data;
}

/**
 * Uploads a file to the TED system (cargar archivo).
 */
export async function tedUpload(
  params: TedUploadParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TedUploadResponse> {
  const creds = getProductCredentials(config, 'ted');
  const body: Record<string, unknown> = {
    ...tedBaseBody(config),
    clientId: creds.merchantId,
    file_content: params.fileContent,
    file_name: params.fileName,
    file_type: params.fileType,
    ...(params.description && { description: params.description }),
  };

  const response = await apiRequest<TedUploadResponse>({
    method: 'POST',
    url: endpoints.tedUploadUrl,
    clientId: creds.clientId,
    body,
  });
  return response.data;
}

/**
 * Downloads a file from the TED system (descargar archivo).
 */
export async function tedDownload(
  params: TedDownloadParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TedDownloadResponse> {
  const creds = getProductCredentials(config, 'ted');
  const body: Record<string, unknown> = {
    ...tedBaseBody(config),
    clientId: creds.merchantId,
    batch_id: params.batchId,
    ...(params.fileId && { file_id: params.fileId }),
  };

  const response = await apiRequest<TedDownloadResponse>({
    method: 'POST',
    url: endpoints.tedDownloadUrl,
    clientId: creds.clientId,
    body,
  });
  return response.data;
}

/**
 * Lists TED batches (listar lote).
 */
export async function tedListBatch(
  params: TedListBatchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TedListBatchResponse> {
  const creds = getProductCredentials(config, 'ted');
  const body: Record<string, unknown> = {
    ...tedBaseBody(config),
    clientId: creds.merchantId,
    ...(params.dateFrom && { date_from: params.dateFrom }),
    ...(params.dateTo && { date_to: params.dateTo }),
    ...(params.status && { status: params.status }),
  };

  const response = await apiRequest<TedListBatchResponse>({
    method: 'POST',
    url: endpoints.tedListBatchUrl,
    clientId: creds.clientId,
    body,
  });
  return response.data;
}
