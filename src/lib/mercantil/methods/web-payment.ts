// ============================================================================
// WUIPI MERCANTIL SDK — Boton de Pagos Web (Unified Payment Button)
// Producto 9: Handles Debito Inmediato + Tarjetas + Pago Movil C2P
// Uses 'web_button' product credentials
// ============================================================================

import type {
  MercantilConfig,
  MercantilEndpoints,
  ProductCredentials,
  WebPaymentButtonParams,
  WebPaymentButtonResponse,
} from '../types';
import { encryptTransactionData } from '../core/crypto';
import { getProductCredentials } from '../core/config';
import { generatePaymentToken } from '../utils/helpers';

function buildTransactionData(
  params: WebPaymentButtonParams,
  config: MercantilConfig,
  creds: ProductCredentials
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    merchant_id: creds.merchantId,
    integrator_id: config.integratorId,
    terminal_id: config.terminalId,
    amount: params.amount.toFixed(2),
    currency: params.currency || 'VES',
    invoice_number: params.invoiceNumber,
    description: params.description || `Pago WUIPI - ${params.invoiceNumber}`,
    ...(params.customerEmail && { customer_email: params.customerEmail }),
    ...(params.customerPhone && { customer_phone: params.customerPhone }),
    return_url: params.returnUrl || config.returnUrl || config.webhookUrl || '',
    payment_methods: {
      debito_inmediato: params.paymentMethods?.debitoInmediato ?? true,
      tarjetas: params.paymentMethods?.tarjetas ?? true,
      c2p: params.paymentMethods?.c2p ?? true,
    },
    timestamp: new Date().toISOString(),
  };

  if (params.metadata) {
    data.metadata = params.metadata;
  }

  return data;
}

/**
 * Creates a payment button URL.
 * Encrypts the transaction data and builds the redirect URL.
 */
export function createWebPayment(
  params: WebPaymentButtonParams,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): WebPaymentButtonResponse {
  const creds = getProductCredentials(config, 'web_button');
  const rawData = buildTransactionData(params, config, creds);
  const encryptedData = encryptTransactionData(rawData, creds.secretKey);
  const encodedData = encodeURIComponent(encryptedData);

  const redirectUrl =
    `${endpoints.webPaymentButton}` +
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
  customerEmail: string,
  config: MercantilConfig,
  endpoints: MercantilEndpoints
): WebPaymentButtonResponse {
  return createWebPayment(
    {
      amount,
      currency: 'VES',
      invoiceNumber,
      description: `Pago servicio internet WUIPI - Factura ${invoiceNumber}`,
      customerEmail,
      paymentMethods: {
        debitoInmediato: true,
        tarjetas: true,
        c2p: true,
      },
      metadata: {
        source: 'wuipi-billing',
        invoice: invoiceNumber,
      },
    },
    config,
    endpoints
  );
}
