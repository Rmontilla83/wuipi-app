// ============================================================================
// WUIPI MERCANTIL SDK — Configuration & Environment Management
// ============================================================================

import type { MercantilConfig, MercantilEndpoints } from '../types';
import { validateSecretKey } from './crypto';

const SANDBOX_BASE = 'https://apicert.mercantilbanco.com';
const PRODUCTION_BASE = 'https://api.mercantilbanco.com';

function resolveEndpoints(baseUrl: string): MercantilEndpoints {
  return {
    webPaymentButton: `${baseUrl}/mercantil/boton-pagos-web/v1/pagos`,
    cardAuthUrl: `${baseUrl}/mercantil/boton-pagos-tarjetas/v1/autenticar`,
    cardPayUrl: `${baseUrl}/mercantil/boton-pagos-tarjetas/v1/pagar`,
    c2pUrl: `${baseUrl}/mercantil/pagos-moviles-c2p/v1/pagar`,
    searchTransfersUrl: `${baseUrl}/mercantil/busqueda-transferencias/v1/buscar`,
    searchMobilePaymentsUrl: `${baseUrl}/mercantil/busqueda-pagos-moviles/v1/buscar`,
    searchCardPaymentsUrl: `${baseUrl}/mercantil/busqueda-pagos-tarjetas/v1/buscar`,
    requestPaymentKeyUrl: `${baseUrl}/mercantil/solicitud-clave-pago/v1/solicitar`,
    installmentsUrl: `${baseUrl}/mercantil/agendamiento-cuotas/v1/agendar`,
  };
}

export interface ResolvedConfig {
  config: MercantilConfig;
  endpoints: MercantilEndpoints;
  /** true if all credentials are present and valid */
  isConfigured: boolean;
}

/**
 * Validates and resolves the Mercantil configuration.
 * Does NOT throw on missing credentials — returns isConfigured: false instead.
 */
export function resolveConfig(config: MercantilConfig): ResolvedConfig {
  const required: (keyof MercantilConfig)[] = [
    'clientId', 'merchantId', 'integratorId',
    'terminalId', 'secretKey', 'environment',
  ];

  const missingFields = required.filter((field) => !config[field]);
  const hasAllFields = missingFields.length === 0;
  const keyValid = hasAllFields && validateSecretKey(config.secretKey);

  if (!hasAllFields) {
    console.warn(
      `[MercantilSDK] Missing config fields: ${missingFields.join(', ')}. ` +
      'SDK will not process real payments until credentials are provided.'
    );
  } else if (!keyValid) {
    console.warn('[MercantilSDK] SecretKey validation failed. Check your credentials.');
  }

  const baseUrl = config.baseUrl ||
    (config.environment === 'production' ? PRODUCTION_BASE : SANDBOX_BASE);

  return {
    config: { ...config, baseUrl },
    endpoints: resolveEndpoints(baseUrl),
    isConfigured: hasAllFields && keyValid,
  };
}

/**
 * Loads configuration from environment variables.
 */
export function configFromEnv(): MercantilConfig {
  return {
    clientId: process.env.MERCANTIL_CLIENT_ID || '',
    merchantId: process.env.MERCANTIL_MERCHANT_ID || '',
    integratorId: process.env.MERCANTIL_INTEGRATOR_ID || '',
    terminalId: process.env.MERCANTIL_TERMINAL_ID || '',
    secretKey: process.env.MERCANTIL_SECRET_KEY || '',
    environment: (process.env.MERCANTIL_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    baseUrl: process.env.MERCANTIL_BASE_URL || undefined,
    webhookUrl: process.env.MERCANTIL_WEBHOOK_URL || undefined,
  };
}

/**
 * Returns the standard HTTP headers for Mercantil API requests.
 */
export function getApiHeaders(clientId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-IBM-Client-Id': clientId,
  };
}

/**
 * Returns the merchant identification block used in most API requests.
 */
export function getMerchantIdentify(config: MercantilConfig) {
  return {
    integratorId: config.integratorId,
    merchantId: config.merchantId,
    terminalId: config.terminalId,
  };
}
