// ============================================================================
// WUIPI MERCANTIL SDK — Configuration & Environment Management
// Multi-Product Credentials Architecture
// ============================================================================

import type {
  MercantilConfig,
  MercantilEndpoints,
  MercantilProduct,
  ProductCredentials,
} from '../types';
import { validateSecretKey } from './crypto';

// Correct base URLs from Mercantil documentation
const SANDBOX_BASE = 'https://apimbu.mercantilbanco.com/mercantil-banco/sandbox';
const PRODUCTION_BASE = 'https://apimbu.mercantilbanco.com/mercantil-banco/prod';

function resolveEndpoints(baseUrl: string, webButtonBaseUrl?: string): MercantilEndpoints {
  return {
    // Card Payments (Producto 1)
    cardAuthUrl: `${baseUrl}/v1/payment/getauth`,
    cardPayUrl: `${baseUrl}/v1/payment/pay`,
    // C2P Payment (Producto 2)
    c2pUrl: `${baseUrl}/v1/payment/c2p`,
    // C2P Key Request (Producto 3)
    c2pKeyRequestUrl: `${baseUrl}/v1/mobile-payment/scp`,
    // Card Search (Producto 4)
    searchCardPaymentsUrl: `${baseUrl}/v1/payment/search`,
    // Mobile Search (Producto 5)
    searchMobilePaymentsUrl: `${baseUrl}/v1/mobile-payment/search`,
    // Transfer Search (Producto 6)
    searchTransfersUrl: `${baseUrl}/v1/payment/transfer-search`,
    // Scheduling (Producto 7)
    createContractUrl: `${baseUrl}/v1/payment/create-contract`,
    consultContractUrl: `${baseUrl}/v1/payment/consult-contract`,
    cancelContractUrl: `${baseUrl}/v1/payment/cancel-contract`,
    // TED (Producto 8)
    tedUploadUrl: `${baseUrl}/v2/ted/cargar-archivo`,
    tedDownloadUrl: `${baseUrl}/v2/ted/descargar-archivo`,
    tedListMailboxUrl: `${baseUrl}/v2/ted/listar-buzon`,
    tedListBatchUrl: `${baseUrl}/v2/ted/listar-lote`,
    // Web Button (Producto 9) — uses its own frontend URL, different from API base
    webPaymentButton: webButtonBaseUrl
      ? webButtonBaseUrl.replace(/\/$/, '')
      : `${baseUrl}/v1/payment/web-button`,
  };
}

export interface ResolvedConfig {
  config: MercantilConfig;
  endpoints: MercantilEndpoints;
  /** Set of products that have valid credentials configured */
  configuredProducts: Set<MercantilProduct>;
}

/**
 * Checks if a product has valid credentials without throwing.
 */
export function isProductConfigured(
  config: MercantilConfig,
  product: MercantilProduct
): boolean {
  const creds = config.products[product];
  if (!creds || !creds.merchantId || !creds.secretKey || !creds.clientId) return false;
  return validateSecretKey(creds.secretKey);
}

/**
 * Validates and resolves the Mercantil configuration.
 * Checks each product's credentials individually.
 */
export function resolveConfig(config: MercantilConfig): ResolvedConfig {
  const baseUrl = config.baseUrl ||
    (config.environment === 'production' ? PRODUCTION_BASE : SANDBOX_BASE);

  const configuredProducts = new Set<MercantilProduct>();
  const allProducts: MercantilProduct[] = [
    'card_payment', 'c2p_payment', 'c2p_key_request', 'card_search',
    'mobile_search', 'transfer_search', 'scheduling', 'scheduling_cards',
    'ted', 'web_button',
  ];

  const resolvedConfig = { ...config, baseUrl };
  const webButtonBaseUrl = config.webButtonBaseUrl;

  for (const product of allProducts) {
    if (isProductConfigured(resolvedConfig, product)) {
      configuredProducts.add(product);
    }
  }

  if (configuredProducts.size === 0) {
    console.warn(
      '[MercantilSDK] No hay productos configurados. ' +
      'El SDK no procesara pagos reales hasta proveer credenciales.'
    );
  } else {
    console.log(
      `[MercantilSDK] Productos configurados (${configuredProducts.size}): ${[...configuredProducts].join(', ')}`
    );
  }

  return {
    config: resolvedConfig,
    endpoints: resolveEndpoints(baseUrl, webButtonBaseUrl),
    configuredProducts,
  };
}

/**
 * Loads configuration from environment variables.
 * Uses the user's exact env var naming convention per product.
 */
export function configFromEnv(): MercantilConfig {
  const env = process.env;

  function loadProduct(
    merchantIdVar: string,
    secretKeyVar: string,
    clientIdVar: string,
    baseUrlVar?: string
  ): ProductCredentials | undefined {
    const merchantId = env[merchantIdVar] || '';
    const secretKey = env[secretKeyVar] || '';
    const clientId = env[clientIdVar] || '';
    const baseUrl = baseUrlVar ? env[baseUrlVar] : undefined;
    if (!merchantId && !secretKey && !clientId) return undefined;
    return { merchantId, secretKey, clientId, baseUrl: baseUrl || undefined };
  }

  return {
    integratorId: env.MERCANTIL_INTEGRATOR_ID || '',
    terminalId: env.MERCANTIL_TERMINAL_ID || '',
    environment: (env.MERCANTIL_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
    baseUrl: env.MERCANTIL_BASE_URL || undefined,
    webButtonBaseUrl: env.MERCANTIL_WEB_BUTTON_BASE_URL || undefined,
    webhookUrl: env.MERCANTIL_WEBHOOK_URL || undefined,
    returnUrl: env.MERCANTIL_RETURN_URL || undefined,
    products: {
      // Producto 1: Pagos con Tarjetas TDD/TDC
      card_payment: loadProduct(
        'MERCANTIL_CARDS_MERCHANT_ID',
        'MERCANTIL_CARDS_SECRET_KEY',
        'MERCANTIL_CARDS_CLIENT_ID'
      ),
      // Producto 2: Pago Movil C2P
      c2p_payment: loadProduct(
        'MERCANTIL_C2P_MERCHANT_ID',
        'MERCANTIL_C2P_SECRET_KEY',
        'MERCANTIL_C2P_CLIENT_ID'
      ),
      // Producto 3: Solicitud de Clave C2P
      c2p_key_request: loadProduct(
        'MERCANTIL_C2P_KEY_MERCHANT_ID',
        'MERCANTIL_C2P_KEY_SECRET_KEY',
        'MERCANTIL_C2P_KEY_CLIENT_ID'
      ),
      // Producto 4: Busqueda de Pagos con Tarjetas
      card_search: loadProduct(
        'MERCANTIL_SEARCH_CARDS_MERCHANT_ID',
        'MERCANTIL_SEARCH_CARDS_SECRET_KEY',
        'MERCANTIL_SEARCH_CARDS_CLIENT_ID'
      ),
      // Producto 5: Busqueda Movil
      mobile_search: loadProduct(
        'MERCANTIL_SEARCH_MOBILE_MERCHANT_ID',
        'MERCANTIL_SEARCH_MOBILE_SECRET_KEY',
        'MERCANTIL_SEARCH_MOBILE_CLIENT_ID'
      ),
      // Producto 6: Busqueda de Transferencias (DIFFERENT clientId!)
      // Accepts MERCANTIL_SEARCH_TRANSFER_BASE_URL to run in prod while the rest
      // of the SDK stays in sandbox (hybrid mode).
      transfer_search: loadProduct(
        'MERCANTIL_SEARCH_TRANSFER_MERCHANT_ID',
        'MERCANTIL_SEARCH_TRANSFER_SECRET_KEY',
        'MERCANTIL_SEARCH_TRANSFER_CLIENT_ID',
        'MERCANTIL_SEARCH_TRANSFER_BASE_URL'
      ),
      // Producto 7: Agendamiento de Cuotas
      scheduling: loadProduct(
        'MERCANTIL_SCHEDULING_MERCHANT_ID',
        'MERCANTIL_SCHEDULING_SECRET_KEY',
        'MERCANTIL_SCHEDULING_CLIENT_ID'
      ),
      // Producto 7 (tarjetas): Pago inicial con Client-Id diferente
      scheduling_cards: (() => {
        const merchantId = env.MERCANTIL_SCHEDULING_MERCHANT_ID || '';
        const secretKey = env.MERCANTIL_SCHEDULING_SECRET_KEY || '';
        const clientId = env.MERCANTIL_SCHEDULING_CARDS_CLIENT_ID || '';
        if (!merchantId && !secretKey && !clientId) return undefined;
        return { merchantId, secretKey, clientId };
      })(),
      // Producto 8: TED
      ted: loadProduct(
        'MERCANTIL_TED_MERCHANT_ID',
        'MERCANTIL_TED_SECRET_KEY',
        'MERCANTIL_TED_CLIENT_ID'
      ),
      // Producto 9: Boton de Pagos Web
      web_button: loadProduct(
        'MERCANTIL_WEB_BUTTON_MERCHANT_ID',
        'MERCANTIL_WEB_BUTTON_SECRET_KEY',
        'MERCANTIL_WEB_BUTTON_CLIENT_ID'
      ),
    },
  };
}

/**
 * Returns credentials for a specific product.
 * Throws if the product is not configured.
 */
export function getProductCredentials(
  config: MercantilConfig,
  product: MercantilProduct
): ProductCredentials {
  const creds = config.products[product];
  if (!creds || !creds.merchantId || !creds.secretKey || !creds.clientId) {
    throw new Error(
      `[MercantilSDK] Credenciales no configuradas para producto: ${product}. ` +
      'Verifique las variables de entorno correspondientes.'
    );
  }
  return creds;
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
 * Uses shared integratorId/terminalId with product-specific merchantId.
 */
export function getMerchantIdentify(
  config: MercantilConfig,
  productCreds: ProductCredentials
) {
  return {
    integratorId: config.integratorId,
    merchantId: productCreds.merchantId,
    terminalId: config.terminalId,
  };
}

/**
 * Collects all unique secret keys from the product credentials.
 * Used by the webhook handler to try decryption with multiple keys.
 */
export function getAllSecretKeys(config: MercantilConfig): string[] {
  const keys = new Set<string>();
  for (const creds of Object.values(config.products)) {
    if (creds?.secretKey) keys.add(creds.secretKey);
  }
  return [...keys];
}
