// ============================================================================
// WUIPI MERCANTIL SDK — Boton de Pagos Web (Unified Payment Button)
// Producto 9: Handles Debito Inmediato + Tarjetas + Pago Movil C2P
// Estructura según Documentación Botón de Pagos Web Mercantil v3.1
// Uses 'web_button' product credentials
// ============================================================================

import type {
  MercantilConfig,
  MercantilEndpoints,
  WebPaymentButtonParams,
  WebPaymentButtonResponse,
} from '../types';
import { encryptTransactionData } from '../core/crypto';
import { getProductCredentials } from '../core/config';
import { generatePaymentToken, MERCANTIL_INVOICE_NUMBER_MAX_LENGTH } from '../utils/helpers';

/**
 * Builds the transactiondata JSON per Mercantil v3.1 spec.
 * Fields: amount, customerName, returnUrl, merchantId, invoiceNumber,
 *         trxType, currency, paymentConcepts, contract (optional)
 */
function buildTransactionData(
  params: WebPaymentButtonParams,
  config: MercantilConfig
): Record<string, unknown> {
  const creds = getProductCredentials(config, 'web_button');

  // Mercantil enforces a 12-char max on invoiceNumber.number (root cause of
  // production error 821, confirmed by support 2026-04-27).
  if (params.invoiceNumber.number.length > MERCANTIL_INVOICE_NUMBER_MAX_LENGTH) {
    throw new Error(
      `[MercantilSDK] invoiceNumber.number exceeds ${MERCANTIL_INVOICE_NUMBER_MAX_LENGTH} chars: "${params.invoiceNumber.number}" (${params.invoiceNumber.number.length})`
    );
  }

  const data: Record<string, unknown> = {
    amount: params.amount,
    customerName: params.customerName,
    returnUrl: params.returnUrl,
    merchantId: creds.merchantId,
    invoiceNumber: {
      number: params.invoiceNumber.number,
      invoiceCreationDate: params.invoiceNumber.invoiceCreationDate,
      invoiceCancelledDate: params.invoiceNumber.invoiceCancelledDate,
    },
    trxType: params.trxType || 'compra',
    currency: params.currency || 'ves',
    paymentConcepts: params.paymentConcepts || ['b2b', 'c2p', 'tdd'],
  };

  if (params.contract) {
    data.contract = {
      contractNumber: params.contract.contractNumber,
      contractDate: params.contract.contractDate,
    };
  }

  return data;
}

/**
 * Creates a payment button redirect URL.
 * Encrypts transactiondata with AES-128/ECB and builds the full URL
 * with query params: merchantid, integratorid, transactiondata.
 */
export function createWebPayment(
  params: WebPaymentButtonParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): WebPaymentButtonResponse {
  const creds = getProductCredentials(config, 'web_button');
  const rawData = buildTransactionData(params, config);
  const encryptedData = encryptTransactionData(rawData, creds.secretKey);
  const encodedData = encodeURIComponent(encryptedData);

  // Path de la SPA Angular del Boton Web en produccion: /select-payment-method
  // (la doc v3.1 muestra "/mercantil/botondepagos" pero ese path NO existe en
  // botondepagos.mercantilbanco.com — solo en el dominio sandbox de IBM Cloud).
  // Las rutas reales en prod son: select-payment-method, b2b, c2p, tdd, error.
  const redirectUrl =
    `${endpoints.webPaymentButton}/select-payment-method` +
    `?merchantid=${creds.merchantId}` +
    `&integratorid=${config.integratorId}` +
    `&transactiondata=${encodedData}`;

  const paymentToken = generatePaymentToken();

  return {
    redirectUrl,
    transactionData: encryptedData,
    paymentToken,
  };
}

/**
 * Helper: Creates a quick payment URL for a WUIPI invoice.
 */
export function createInvoicePayment(
  invoiceNumber: string,
  amount: number,
  customerName: string,
  returnUrl: string,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): WebPaymentButtonResponse {
  const today = new Date().toISOString().split('T')[0];
  // Default due date: 30 days from now
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  return createWebPayment(
    {
      amount,
      customerName,
      returnUrl,
      currency: 'ves',
      invoiceNumber: {
        number: invoiceNumber,
        invoiceCreationDate: today,
        invoiceCancelledDate: dueDate,
      },
      paymentConcepts: ['b2b', 'c2p', 'tdd'],
    },
    config,
    endpoints
  );
}
