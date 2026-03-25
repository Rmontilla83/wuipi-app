// ============================================================================
// WUIPI MERCANTIL SDK — Type Definitions
// Pasarela de Pagos Banco Mercantil Venezuela
// Multi-Product Credentials Architecture
// ============================================================================

// --- Product Types ---

/** Each Mercantil API product has its own set of credentials */
export type MercantilProduct =
  | 'card_payment'       // Pagos con Tarjetas TDD/TDC (auth + pay)
  | 'c2p_payment'        // Pago Movil C2P
  | 'c2p_key_request'    // Solicitud de Clave C2P
  | 'card_search'        // Busqueda de Pagos con Tarjetas
  | 'mobile_search'      // Busqueda Movil
  | 'transfer_search'    // Busqueda de Transferencias (DIFFERENT clientId!)
  | 'scheduling'         // Agendamiento de Cuotas
  | 'scheduling_cards'   // Agendamiento — pago inicial con tarjeta
  | 'ted'                // Transmision Electronica de Datos
  | 'web_button';        // Boton de Pagos Web

/** Credentials specific to each Mercantil product */
export interface ProductCredentials {
  /** MerchantID / Codigo de comercio */
  merchantId: string;
  /** SecretKey / Clave de Cifrado (raw, before SHA-256) */
  secretKey: string;
  /** X-IBM-Client-Id header value */
  clientId: string;
}

// --- Configuration ---

export interface MercantilConfig {
  /** Shared IntegratorID across all products */
  integratorId: string;
  /** Shared TerminalID across all products */
  terminalId: string;
  /** Environment: 'sandbox' for certification, 'production' for live */
  environment: 'sandbox' | 'production';
  /** Base URL override (optional - auto-resolved from environment) */
  baseUrl?: string;
  /** Web Button has its own frontend URL (IBM Cloud sandbox, different from API base) */
  webButtonBaseUrl?: string;
  /** Webhook URL where Mercantil sends payment notifications */
  webhookUrl?: string;
  /** Return URL after payment */
  returnUrl?: string;
  /** Per-product credentials registry */
  products: Partial<Record<MercantilProduct, ProductCredentials>>;
}

export interface MercantilEndpoints {
  // Card Payments (Producto 1)
  cardAuthUrl: string;           // /v1/payment/getauth
  cardPayUrl: string;            // /v1/payment/pay
  // C2P Payment (Producto 2)
  c2pUrl: string;                // /v1/payment/c2p
  // C2P Key Request (Producto 3)
  c2pKeyRequestUrl: string;      // /v1/mobile-payment/scp
  // Card Search (Producto 4)
  searchCardPaymentsUrl: string; // /v1/payment/search
  // Mobile Search (Producto 5)
  searchMobilePaymentsUrl: string; // /v1/mobile-payment/search
  // Transfer Search (Producto 6)
  searchTransfersUrl: string;    // /v1/payment/transfer-search
  // Scheduling (Producto 7)
  createContractUrl: string;     // /v1/payment/create-contract
  consultContractUrl: string;    // /v1/payment/consult-contract
  cancelContractUrl: string;     // /v1/payment/cancel-contract
  // TED (Producto 8)
  tedUploadUrl: string;          // /v2/ted/cargar-archivo
  tedDownloadUrl: string;        // /v2/ted/descargar-archivo
  tedListMailboxUrl: string;     // /v2/ted/listar-buzon
  tedListBatchUrl: string;       // /v2/ted/listar-lote
  // Web Button (Producto 9)
  webPaymentButton: string;
}

// --- Encryption ---

export interface EncryptedData {
  /** The encrypted + base64 encoded string */
  encrypted: string;
  /** The original plaintext (for debugging in sandbox only) */
  plaintext?: string;
}

// --- Common Request/Response ---

export interface MerchantIdentify {
  integratorId: string;
  merchantId: string;
  terminalId: string;
}

/**
 * Client identification block.
 * P1-P5 use snake_case: { ipaddress, browser_agent }
 * P6-P8 use camelCase: { ipAddress, browserAgent }
 * The SDK methods handle this internally.
 */
export interface ClientIdentify {
  ipaddress: string;
  browser_agent: string;
  mobile?: {
    manufacturer: string;
    model?: string;
    os_version?: string;
    location?: {
      lat: number;
      lng: number;
    };
  };
}

// --- Web Payment Button (Boton de Pagos Web) ---
// Estructura según Documentación Botón de Pagos Web Mercantil v3.1

/** Payment concepts (métodos de pago) supported by the Web Button */
export type WebPaymentConcept = 'b2b' | 'c2p' | 'tdd';

export interface WebPaymentButtonParams {
  /** Transaction amount (number, not string) */
  amount: number;
  /** Customer name (required by Mercantil) */
  customerName: string;
  /** URL to redirect after payment (required) */
  returnUrl: string;
  /** Invoice information (required) */
  invoiceNumber: {
    /** Invoice number */
    number: string;
    /** Invoice creation date (YYYY-MM-DD) */
    invoiceCreationDate: string;
    /** Invoice cancellation/due date (YYYY-MM-DD) */
    invoiceCancelledDate: string;
  };
  /** Transaction type (default: 'compra') */
  trxType?: 'compra';
  /** Currency (default: 'ves') */
  currency?: 'ves' | 'usd';
  /** Payment methods to show: 'b2b' (debito inmediato), 'c2p' (pago movil), 'tdd' (tarjeta debito) */
  paymentConcepts?: WebPaymentConcept[];
  /** Contract info (optional) */
  contract?: {
    contractNumber: string;
    contractDate: string; // YYYY-MM-DD
  };
}

export interface WebPaymentButtonResponse {
  /** The full redirect URL for the payment button */
  redirectUrl: string;
  /** The encrypted transaction data */
  transactionData: string;
  /** The generated payment token for tracking */
  paymentToken: string;
}

// --- Card Payments (Boton de Pagos con Tarjetas) ---

export type CardType = 'credit' | 'debit';
export type CardBrand = 'visa' | 'mastercard' | 'diners' | 'maestro';

/** Postman: node "transaction_authInfo" with trx_type="solaut" */
export interface CardAuthRequest {
  merchant_identify: MerchantIdentify;
  client_identify: ClientIdentify;
  transaction_authInfo: {
    trx_type: 'solaut';
    payment_method: 'tdd' | 'tdc';
    customer_id: string;
    card_number: string;
  };
}

export interface CardAuthResponse {
  auth_model: string;
  auth_reference: string;
  status: string;
  message: string;
}

export interface CardPayRequest {
  merchant_identify: MerchantIdentify;
  client_identify: ClientIdentify;
  card_payment: {
    card_number: string;
    expiry_date: string;
    cvv: string;
    name: string;
    customer_id: string;
    customer_id_type: string;
    amount: number;
    currency: string;
    auth_code: string;
    auth_reference: string;
    invoice_number: string;
    card_type: CardType;
  };
}

export interface CardPayResponse {
  reference_number: string;
  authorization_code: string;
  status: string;
  message: string;
  amount: number;
  transaction_date: string;
}

// --- Mobile Payments C2P ---

export interface C2PPaymentRequest {
  merchant_identify: MerchantIdentify;
  client_identify: ClientIdentify;
  transaction_c2p: {
    amount: number;
    currency: 'ves';
    destination_bank_id: string;
    destination_id: string;
    origin_mobile_number: string;
    destination_mobile_number: string;
    trx_type: 'compra' | 'vuelto';
    payment_method: 'c2p';
    invoice_number: string;
    purchase_key?: string;
  };
}

export interface C2PPaymentResponse {
  reference_number: string;
  status: string;
  message: string;
  amount: number;
  bank_transaction_id?: string;
}

// --- C2P Key Request (Solicitud de Clave de Pago) ---

/** Postman: node "transaction_scpInfo" */
export interface C2PKeyRequestPayload {
  merchant_identify: MerchantIdentify;
  client_identify: ClientIdentify;
  transaction_scpInfo: {
    destination_id: string;
    destination_mobile_number: string;
  };
}

export interface C2PKeyResponse {
  status: string;
  message: string;
  key_reference?: string;
}

// --- Payment Search / Reconciliation ---

export interface TransferSearchParams {
  /** Account number (will be encrypted) */
  account: string;
  /** Customer/RIF ID (will be encrypted) */
  issuerCustomerId: string;
  /** Transaction date YYYY-MM-DD */
  trxDate: string;
  /** Issuer bank code (e.g. 105 for Mercantil) */
  issuerBankId: number;
  /** Transaction type (e.g. 1) */
  transactionType: number;
  /** Payment reference number */
  paymentReference: string;
  /** Amount */
  amount: number;
}

export interface TransferSearchResult {
  reference_number: string;
  amount: number;
  date: string;
  origin_bank: string;
  origin_account: string;
  status: string;
  description: string;
}

/** Postman: node "search_by" with trx_date, payment_reference. Phones encrypted. */
export interface MobilePaymentSearchParams {
  trxDate: string;
  paymentReference?: string;
  amount?: number;
  /** Destination phone (will be encrypted). Optional filter. */
  destinationMobile?: string;
  /** Origin phone (will be encrypted). Optional filter. */
  originMobile?: string;
}

/** Postman: node "search_by" with procesing_date (1 's'), search_criteria */
export interface CardPaymentSearchParams {
  processingDate: string;
  searchCriteria?: 'unique';
  invoiceNumber?: string;
  paymentReference?: string;
}

// --- Scheduling (Agendamiento de Cuotas) ---

/** Installment detail for scheduling */
export interface InstallmentInfo {
  installmentNumber: number;
  amount: number;
  paymentDate: string;
  status: string;
}

export interface CreateContractParams {
  cardNumber: string;
  expiryDate: string; // YYYY/MM
  cardholderName: string;
  customerId: string; // e.g. "V99999999"
  customerEmail?: string;
  accountNumber?: string;
  amount: number;
  currency?: string;
  /** M=monthly, Q=biweekly, S=weekly */
  frequency: string;
  startDate: string;
  paymentReference: string;
  paymentMethod?: 'TDD' | 'TDC';
  contractNumber?: string;
  collectionAttempts?: number;
  installments: InstallmentInfo[];
}

export interface CreateContractResponse {
  installmentCreationResponse: {
    contractNumber: string;
    contractStatus: number;
    installmentsScheduleInfo: InstallmentInfo[];
  };
}

export interface ConsultContractResponse {
  consultContractsResponse: {
    paymentMethod: string;
    customerName: string;
    customerEmail: string;
    customerId: string;
    contractNumber: string;
    cardNumber: string;
    currency: string;
    amountToFinance: number;
    contractStatus: number;
    numberInstallments: number;
    paymentFrecuency: string;
    firstPaymentDate: string;
    installmentsInfoConsult: Array<InstallmentInfo & { attemptsForCollection: number }>;
  };
}

export interface CancelContractResponse {
  cancelContractResponse: {
    contractStatus: number;
    description: string;
    cancellationReason: number;
    contractNumber: string;
  };
}

// --- TED (Transmision Electronica de Datos) ---

export interface TedUploadParams {
  fileContent: string; // base64
  fileName: string;
  fileType: string;
  description?: string;
}

export interface TedUploadResponse {
  batch_id: string;
  status: string;
  message: string;
}

export interface TedDownloadParams {
  batchId: string;
  fileId?: string;
}

export interface TedDownloadResponse {
  file_content: string; // base64
  file_name: string;
  file_type: string;
}

export interface TedListMailboxParams {
  /** Inbox type: "entrada" (incoming) or "salida" (outgoing). Encrypted. */
  inboxType?: string;
}

export interface TedListMailboxResponse {
  messages: Array<{
    id: string;
    subject: string;
    date: string;
    status: string;
  }>;
}

export interface TedListBatchParams {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}

export interface TedListBatchResponse {
  batches: Array<{
    batch_id: string;
    file_count: number;
    date: string;
    status: string;
  }>;
}

// --- Webhook / Notification ---

export interface WebhookPayload {
  transaction_type: string;
  payment_method: string;
  reference_number: string;
  authorization_code?: string;
  amount: number;
  currency: string;
  status: 'approved' | 'declined' | 'error' | 'pending';
  message: string;
  invoice_number: string;
  transaction_date: string;
  raw?: Record<string, unknown>;
}

export type WebhookHandler = (payload: WebhookPayload) => Promise<void>;

// --- Venezuelan Bank Codes ---

export const VENEZUELAN_BANKS: Record<string, string> = {
  '0001': 'Banco Central de Venezuela',
  '0102': 'Banco de Venezuela',
  '0104': 'Venezolano de Credito',
  '0105': 'Banco Mercantil',
  '0108': 'Banco Provincial',
  '0114': 'Bancaribe',
  '0115': 'Banco Exterior',
  '0116': 'Banco Occidental de Descuento',
  '0128': 'Banco Caroni',
  '0134': 'Banesco',
  '0137': 'Banco Sofitasa',
  '0138': 'Banco Plaza',
  '0146': 'Bangente',
  '0151': 'BFC Banco Fondo Comun',
  '0156': '100% Banco',
  '0157': 'DelSur',
  '0163': 'Banco del Tesoro',
  '0166': 'Banco Agricola de Venezuela',
  '0168': 'Bancrecer',
  '0169': 'Mi Banco',
  '0171': 'Banco Activo',
  '0172': 'Bancamiga',
  '0173': 'Banco Internacional de Desarrollo',
  '0174': 'Banplus',
  '0175': 'Banco Bicentenario',
  '0177': 'Banfanb',
  '0191': 'Banco Nacional de Credito (BNC)',
};
