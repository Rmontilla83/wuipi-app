/**
 * Mercantil Diagnostic — Búsqueda de Transferencias (transfer-search)
 * Captura completa de request/response para enviar a soporte Mercantil.
 *
 * Run: npx tsx scripts/mercantil-diagnostic-transfer-search.ts
 */

import crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ── Crypto (idéntico a SDK, verificado contra github.com/apimercantil) ──
function deriveKey(secretKey: string): Buffer {
  const hash = crypto.createHash('sha256').update(secretKey, 'utf8').digest();
  const hexString = hash.toString('hex');
  return Buffer.from(hexString.slice(0, hexString.length / 2), 'hex');
}

function enc(plaintext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(true);
  return cipher.update(plaintext, 'utf8', 'base64') + cipher.final('base64');
}

// ── Credentials ──
const merchantId = process.env.MERCANTIL_SEARCH_TRANSFER_MERCHANT_ID || '';
const secretKey = process.env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY || '';
const clientId = process.env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID || '';
const integratorId = parseInt(process.env.MERCANTIL_INTEGRATOR_ID || '31', 10);
const terminalId = process.env.MERCANTIL_TERMINAL_ID || 'abcde';

if (!merchantId || !secretKey || !clientId) {
  console.error('ERROR: Faltan variables de entorno MERCANTIL_SEARCH_TRANSFER_*');
  process.exit(1);
}

// ── Config ──
const BASE_URL = 'https://apimbu.mercantilbanco.com/mercantil-banco/sandbox';
const ENDPOINT = '/v1/payment/transfer-search';
const FULL_URL = `${BASE_URL}${ENDPOINT}`;

// ── Datos de prueba (del xlsx de sandbox) ──
const PLAIN_ACCOUNT = '01050054151054540721';
const PLAIN_CUSTOMER_ID = '17313258';
const TRX_DATE = '2026-03-03';
const ISSUER_BANK_ID = 105;
const TRANSACTION_TYPE = 1;

async function main() {
  const timestamp = new Date().toISOString();

  // ── 1. Valores planos ──
  const plainBody = {
    merchantIdentify: {
      integratorId,
      merchantId: parseInt(merchantId, 10) || merchantId,
      terminalId,
    },
    clientIdentify: {
      ipAddress: '10.0.0.1',
      browserAgent: 'Chrome 18.1.3',
      mobile: { manufacturer: 'Samsung' },
    },
    transferSearch: {
      account: PLAIN_ACCOUNT,
      issuerCustomerId: PLAIN_CUSTOMER_ID,
      trxDate: TRX_DATE,
      issuerBankId: ISSUER_BANK_ID,
      transactionType: TRANSACTION_TYPE,
    },
  };

  // ── 2. Valores cifrados ──
  const encryptedAccount = enc(PLAIN_ACCOUNT, secretKey);
  const encryptedCustomerId = enc(PLAIN_CUSTOMER_ID, secretKey);

  const encryptedBody = {
    merchantIdentify: {
      integratorId,
      merchantId: parseInt(merchantId, 10) || merchantId,
      terminalId,
    },
    clientIdentify: {
      ipAddress: '10.0.0.1',
      browserAgent: 'Chrome 18.1.3',
      mobile: { manufacturer: 'Samsung' },
    },
    transferSearch: {
      account: encryptedAccount,
      issuerCustomerId: encryptedCustomerId,
      trxDate: TRX_DATE,
      issuerBankId: ISSUER_BANK_ID,
      transactionType: TRANSACTION_TYPE,
    },
  };

  // ── 3. Headers ──
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-IBM-Client-Id': clientId,
  };

  // ── 4. Hacer el request real ──
  console.log('Enviando request a Mercantil sandbox...\n');

  let httpStatus = 0;
  let responseBody: unknown = null;
  let responseHeaders: Record<string, string> = {};
  let networkError = '';

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30000);

  try {
    const res = await fetch(FULL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(encryptedBody),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    httpStatus = res.status;
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const text = await res.text();
    try {
      responseBody = JSON.parse(text);
    } catch {
      responseBody = text;
    }
  } catch (err: unknown) {
    clearTimeout(timeout);
    networkError = (err as Error).message;
  }

  // ── 5. Generar reporte ──
  const report = {
    _meta: {
      generadoPor: 'Wuipi Telecomunicaciones — Script Diagnóstico',
      fecha: timestamp,
      proposito: 'Diagnóstico error 99999 en Búsqueda de Transferencias',
      ambiente: 'sandbox',
    },
    '1_endpoint': {
      metodo: 'POST',
      url: FULL_URL,
    },
    '2_headers_enviados': headers,
    '3_body_sin_cifrar': plainBody,
    '4_detalle_cifrado': {
      algoritmo: 'AES-128/ECB/PKCS5Padding',
      derivacion_clave: 'SecretKey → SHA-256 → primeros 16 bytes del hex → clave AES-128',
      campos_cifrados: {
        'transferSearch.account': {
          valor_plano: PLAIN_ACCOUNT,
          valor_cifrado: encryptedAccount,
        },
        'transferSearch.issuerCustomerId': {
          valor_plano: PLAIN_CUSTOMER_ID,
          valor_cifrado: encryptedCustomerId,
        },
      },
      nota: 'Los demás campos (trxDate, issuerBankId, transactionType, merchantIdentify, clientIdentify) se envían en texto plano.',
    },
    '5_body_cifrado_enviado': encryptedBody,
    '6_response': {
      http_status: httpStatus,
      headers: responseHeaders,
      body: responseBody,
      ...(networkError ? { network_error: networkError } : {}),
    },
  };

  // ── Output ──
  const output = JSON.stringify(report, null, 2);
  console.log(output);

  // Guardar a archivo
  const outputPath = path.resolve(__dirname, '..', 'mercantil-diagnostic-transfer-search.json');
  fs.writeFileSync(outputPath, output, 'utf8');
  console.log(`\n✓ Reporte guardado en: ${outputPath}`);
}

main().catch(console.error);
