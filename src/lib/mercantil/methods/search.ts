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
import { getProductCredentials, getMerchantIdentify } from '../core/config';
import { encryptField } from '../core/crypto';
import { apiRequest, MercantilApiError } from '../core/http';
import { transferReferenceLast8, normalizeIssuerCustomerId } from '../utils/helpers';

/**
 * Builds the merchantIdentify block for transfer-search with the special
 * "Numero de persona" override. Mercantil exige aqui el RIF/cedula natural
 * (11269635 para Wuipi), NO el codigo de afiliacion estandar (217546) que
 * usan los otros 8 productos. Confirmado con soporte tecnico Mercantil
 * 2026-05-05. Env var: MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER.
 */
export function buildTransferSearchMerchantIdentify(
  config: MercantilConfig,
  fallbackMerchantId: string
) {
  const personNumber = process.env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || fallbackMerchantId;
  return {
    integratorId: config.integratorId,
    merchantId: personNumber,
    terminalId: config.terminalId,
  };
}

/**
 * Search bank transfers received (Debito Inmediato + interbancarias).
 * Uses 'transfer_search' product credentials — DIFFERENT clientId from other products.
 * Node name is "transferSearchBy" (confirmed by Mercantil).
 * Sensitive fields (account, issuerCustomerId) are encrypted with AES-128/ECB.
 *
 * Quirks fixed por Mercantil 2026-05-05:
 *   1. merchantId DEBE ser MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER (11269635), no 217546
 *   2. paymentReference DEBE ser solo los ultimos 8 digitos de la referencia bancaria
 *
 * Quirks fixed por Mercantil 2026-05-13 (resolución error 9999):
 *   3. clientIdentify DEBE incluir subnodo `mobile`; sin él el API responde 9999 por estructura
 *   4. issuerCustomerId DEBE ir en formato compacto `V17123456` (sin guiones ni puntos)
 */
export async function searchTransfers(
  params: TransferSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): Promise<TransferSearchResult[]> {
  const creds = getProductCredentials(config, 'transfer_search');
  // Per-product baseUrl lets transfer_search run in prod while the rest of
  // the SDK (e.g. web_button) remains in sandbox until its prod creds land.
  const url = creds.baseUrl
    ? `${creds.baseUrl.replace(/\/$/, '')}/v1/payment/transfer-search`
    : endpoints.searchTransfersUrl;
  const normalizedCedula = normalizeIssuerCustomerId(params.issuerCustomerId);
  const truncatedRef = transferReferenceLast8(params.paymentReference);
  const cedulaCipher = encryptField(normalizedCedula, creds.secretKey);
  const accountCipher = encryptField(params.account, creds.secretKey);
  const merchantIdentifyForLog = buildTransferSearchMerchantIdentify(config, creds.merchantId);
  // DEBUG: loggear los valores REALES + cifrados que viajan a Mercantil
  console.log(
    `[searchTransfers] req | rawCedula=${JSON.stringify(params.issuerCustomerId)} → normalized=${JSON.stringify(normalizedCedula)} → cipher_first20=${cedulaCipher.slice(0,20)} cipher_full_b64_len=${cedulaCipher.length}`
  );
  console.log(
    `[searchTransfers] req | account=${params.account} → cipher_first20=${accountCipher.slice(0,20)} | rawRef=${JSON.stringify(params.paymentReference)} → last8=${JSON.stringify(truncatedRef)}`
  );
  console.log(
    `[searchTransfers] req | bank=${params.issuerBankId} (${typeof params.issuerBankId}) type=${params.transactionType} (${typeof params.transactionType}) date=${params.trxDate} amount=${params.amount} (${typeof params.amount})`
  );
  console.log(
    `[searchTransfers] req | merchantIdentify=${JSON.stringify(merchantIdentifyForLog)} types=${JSON.stringify({intId: typeof merchantIdentifyForLog.integratorId, mId: typeof merchantIdentifyForLog.merchantId, tId: typeof merchantIdentifyForLog.terminalId})}`
  );
  const body: Record<string, unknown> = {
    merchantIdentify: merchantIdentifyForLog,
    clientIdentify: {
      ipAddress: '127.0.0.1',
      // Mercantil valida formato "Nombre Version" (errorCode 51 con Mozilla/5.0)
      browserAgent: 'Chrome 18.1.3',
      mobile: { manufacturer: 'Samsung' },
    },
    transferSearchBy: {
      account: accountCipher,
      issuerCustomerId: cedulaCipher,
      trxDate: params.trxDate,
      issuerBankId: params.issuerBankId,
      transactionType: params.transactionType,
      paymentReference: truncatedRef,
      amount: params.amount,
    },
  };

  try {
    const response = await apiRequest<{
      transactions?: TransferSearchResult[];
      transferSearchList?: TransferSearchResult[];
    }>({
      method: 'POST', url,
      clientId: creds.clientId, body,
    });
    // Mercantil prod devuelve el nodo "transferSearchList" en español; algunas
    // versiones del playground devuelven "transactions". Aceptamos ambos.
    return response.data.transferSearchList || response.data.transactions || [];
  } catch (err) {
    // Mercantil señala "no se encontraron transacciones" con HTTP 400 +
    // errorCode 330 en lugar del esperado HTTP 200 con array vacío.
    // Lo tratamos como búsqueda válida sin matches para que el caller pueda
    // iterar (por fecha, por monto, etc) sin que el SDK throwee.
    //
    // Importante: duck-type check (no `instanceof MercantilApiError`). En
    // bundling de Next.js la clase puede aparecer duplicada entre módulos
    // compilados separados y el instanceof falla aunque la shape sea idéntica.
    const e = err as {
      status?: number;
      details?: { errorList?: Array<{ errorCode?: string | number; description?: string }> };
    } | undefined;
    const errorList = e?.details?.errorList;
    const isApiErrorShape = typeof e?.status === 'number' && Array.isArray(errorList);
    if (isApiErrorShape) {
      const hasNoMatch = errorList!.some(item => String(item?.errorCode) === '330');
      // Log condicional para que en prod podamos confirmar qué pasó cuando un
      // item queda en conciliating: el catch atrapó el error correctamente y
      // decidió "no match" sin throwear; el caller puede continuar el loop.
      console.log(
        `[searchTransfers] caught ApiError-shape status=${e!.status} errorCodes=[${errorList!.map(i => i.errorCode).join(',')}] hasNoMatch=${hasNoMatch} (instanceof MercantilApiError? ${err instanceof MercantilApiError})`
      );
      if (hasNoMatch) return [];
    } else {
      console.warn(
        `[searchTransfers] caught non-ApiError-shape err — re-throwing. shape=${JSON.stringify({
          status: e?.status,
          hasDetails: !!e?.details,
          hasErrorList: Array.isArray(errorList),
        })}`
      );
    }
    throw err;
  }
}

/**
 * Search mobile payments (C2P, P2C, Vuelto) via Tpago.
 * Uses 'mobile_search' product credentials.
 * Postman/playground: snake_case, node "search_by".
 * Phone numbers are ENCRYPTED. trx_date format: YYYY-MM-DD (hyphens).
 */
export async function searchMobilePayments(
  params: MobilePaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const creds = getProductCredentials(config, 'mobile_search');
  const body: Record<string, unknown> = {
    merchant_identify: getMerchantIdentify(config, creds),
    client_identify: {
      ipaddress: '127.0.0.1',
      browser_agent: 'Mozilla/5.0',
    },
    search_by: {
      trx_date: params.trxDate,
      payment_reference: params.paymentReference || '',
      amount: params.amount || 0,
      currency: 'ves',
      destination_mobile_number: params.destinationMobile
        ? encryptField(params.destinationMobile, creds.secretKey) : '',
      origin_mobile_number: params.originMobile
        ? encryptField(params.originMobile, creds.secretKey) : '',
    },
  };

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchMobilePaymentsUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}

/**
 * Search card payment transactions (TDC/TDD).
 * Uses 'card_search' product credentials.
 * Postman: snake_case, node "search_by" with procesing_date (1 's'),
 * integratorId/merchantId as strings.
 */
export async function searchCardPayments(
  params: CardPaymentSearchParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
) {
  const creds = getProductCredentials(config, 'card_search');
  const body: Record<string, unknown> = {
    merchant_identify: {
      integratorId: String(config.integratorId),
      merchantId: creds.merchantId,
      terminalId: config.terminalId,
    },
    client_identify: {
      ipaddress: '127.0.0.1',
      browser_agent: 'Mozilla/5.0',
    },
    search_by: {
      search_criteria: params.searchCriteria || 'unique',
      procesing_date: params.processingDate.replace(/-/g, '/'),
      invoice_number: params.invoiceNumber || '',
      payment_reference: params.paymentReference || '',
    },
  };

  const response = await apiRequest<{ transactions: unknown[] }>({
    method: 'POST', url: endpoints.searchCardPaymentsUrl,
    clientId: creds.clientId, body,
  });
  return response.data.transactions || [];
}
