/**
 * Mercantil Sandbox — Prueba completa 8 productos.
 * Estructuras corregidas según Postman oficial de Mercantil:
 *   - P1-P5: snake_case (merchant_identify, ipaddress, browser_agent)
 *   - P6: camelCase (transferSearchBy) — ya corregido
 *   - P7: scheduling (sin doc pública, se intenta snake_case)
 *   - P8: TED camelCase + nodos inboxType/clientId
 *
 * Run: npx tsx scripts/test-mercantil-sandbox.ts
 */

import crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ── Crypto ──
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

// ── Config ──
const BASE = 'https://apimbu.mercantilbanco.com/mercantil-banco/sandbox';

interface Creds { merchantId: string; secretKey: string; clientId: string }
function load(prefix: string): Creds {
  return {
    merchantId: process.env[`MERCANTIL_${prefix}_MERCHANT_ID`] || '',
    secretKey: process.env[`MERCANTIL_${prefix}_SECRET_KEY`] || '',
    clientId: process.env[`MERCANTIL_${prefix}_CLIENT_ID`] || '',
  };
}
const P = {
  cards: load('CARDS'),
  c2p: load('C2P'),
  c2pKey: load('C2P_KEY'),
  searchCards: load('SEARCH_CARDS'),
  searchMobile: load('SEARCH_MOBILE'),
  searchTransfer: load('SEARCH_TRANSFER'),
  scheduling: load('SCHEDULING'),
  ted: load('TED'),
};

// ── HTTP ──
interface Result { status: number; ok: boolean; data: unknown; durationMs: number }
async function post(url: string, clientId: string, body: Record<string, unknown>): Promise<Result> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-IBM-Client-Id': clientId },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data, durationMs: Date.now() - start };
  } catch (err: unknown) {
    clearTimeout(t);
    return { status: 0, ok: false, data: `NETWORK ERROR: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

// ── Bloques comunes ──

// P1-P5 usan snake_case: merchant_identify, ipaddress, browser_agent
function merchant_identify(c: Creds) {
  return {
    integratorId: 31,
    merchantId: parseInt(c.merchantId, 10) || c.merchantId,
    terminalId: 'abcde',
  };
}
const client_identify = {
  ipaddress: '127.0.0.1',
  browser_agent: 'Chrome 18.1.3',
  mobile: { manufacturer: 'Samsung' },
};

// P6-P8 usan camelCase: merchantIdentify, ipAddress, browserAgent
function merchantIdentify(c: Creds) {
  return {
    integratorId: 31,
    merchantId: parseInt(c.merchantId, 10) || c.merchantId,
    terminalId: 'abcde',
  };
}
const clientIdentify = {
  ipAddress: '127.0.0.1',
  browserAgent: 'Chrome 18.1.3',
  mobile: { manufacturer: 'Samsung' },
};

// ══════════════════════════════════════════════════════════════════
// P1: Pagos con Tarjetas — getauth (Solicitud de Autenticación)
// Postman/playground: customer_id y card_number van SIN CIFRAR
// Datos xlsx: V10780248, tarjeta 4532310053032530
// ══════════════════════════════════════════════════════════════════
function test_p1_cards() {
  const c = P.cards;
  return post(`${BASE}/v1/payment/getauth`, c.clientId, {
    merchant_identify: merchant_identify(c),
    client_identify,
    transaction_authInfo: {
      trx_type: 'solaut',
      payment_method: 'tdd',
      customer_id: 'V10780248',
      card_number: '4532310053032530',
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// P2: Pago Movil C2P
// Postman: nodo "transaction_c2p", destination_bank_id como number
// Datos xlsx: V18367443, origen 584142591177, destino 584241513063
// ══════════════════════════════════════════════════════════════════
function test_p2_c2p() {
  const c = P.c2p;
  return post(`${BASE}/v1/payment/c2p`, c.clientId, {
    merchant_identify: merchant_identify(c),
    client_identify,
    transaction_c2p: {
      amount: 100.00,
      currency: 'ves',
      destination_bank_id: 105,
      destination_id: enc('V18367443', c.secretKey),
      origin_mobile_number: enc('584142591177', c.secretKey),
      destination_mobile_number: enc('584241513063', c.secretKey),
      trx_type: 'compra',
      payment_method: 'c2p',
      invoice_number: `TEST-C2P-${Date.now()}`,
      twofactor_auth: enc('00001111', c.secretKey),
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// P3: Solicitud de Clave C2P (SCP)
// Postman: nodo "transaction_scpInfo"
// Datos xlsx: V18367443, destino 584241513063
// ══════════════════════════════════════════════════════════════════
function test_p3_c2pKey() {
  const c = P.c2pKey;
  return post(`${BASE}/v1/mobile-payment/scp`, c.clientId, {
    merchant_identify: merchant_identify(c),
    client_identify,
    transaction_scpInfo: {
      destination_id: enc('V18367443', c.secretKey),
      destination_mobile_number: enc('584241513063', c.secretKey),
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// P4: Búsqueda de Pagos con Tarjetas
// Postman: nodo "search_by", campo "procesing_date" (1 sola 's')
// Formato fecha: YYYY/MM/DD (con slashes, NO guiones)
// Requiere invoice_number o payment_reference (uno de los dos)
// Datos xlsx tarjetas: referencia de pago del test P1
// ══════════════════════════════════════════════════════════════════
function test_p4_searchCards() {
  const c = P.searchCards;
  return post(`${BASE}/v1/payment/search`, c.clientId, {
    merchant_identify: {
      integratorId: '31',
      merchantId: c.merchantId,
      terminalId: 'abcde',
    },
    client_identify,
    search_by: {
      search_criteria: 'unique',
      procesing_date: '2026/03/03',
      invoice_number: '',
      payment_reference: '25508782358',
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// P5: Búsqueda Móvil
// Postman/playground: nodo "search_by", teléfonos CIFRADOS
// payment_reference obligatorio según API (aunque Postman lo muestra vacío)
// trx_date formato YYYY-MM-DD (guiones, diferente de P4)
// Datos: referencia 6460003485 (obtenida de P2 C2P response)
// ══════════════════════════════════════════════════════════════════
function test_p5_searchMobile() {
  const c = P.searchMobile;
  return post(`${BASE}/v1/mobile-payment/search`, c.clientId, {
    merchant_identify: merchant_identify(c),
    client_identify,
    search_by: {
      amount: 100.00,
      currency: 'ves',
      destination_mobile_number: enc('584241513063', c.secretKey),
      origin_mobile_number: enc('584142591177', c.secretKey),
      payment_reference: '6460003485',
      trx_date: '2026-03-03',
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// P6: Búsqueda de Transferencias — YA CORREGIDO
// camelCase, nodo "transferSearchBy"
// ══════════════════════════════════════════════════════════════════
function test_p6_searchTransfer() {
  const c = P.searchTransfer;
  return post(`${BASE}/v1/payment/transfer-search`, c.clientId, {
    merchantIdentify: merchantIdentify(c),
    clientIdentify,
    transferSearchBy: {
      account: enc('01050054151054540721', c.secretKey),
      issuerCustomerId: enc('J405660872', c.secretKey),
      trxDate: '2026-03-03',
      issuerBankId: 105,
      transactionType: '1',
      paymentReference: '25508782358',
      amount: 1230,
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// P7: Agendamiento — consult-contract
// No hay doc pública. Intentamos snake_case como P1-P5
// ══════════════════════════════════════════════════════════════════
function test_p7_scheduling() {
  const c = P.scheduling;
  return post(`${BASE}/v1/payment/consult-contract`, c.clientId, {
    merchant_identify: merchant_identify(c),
    client_identify,
    contract_id: 'TEST-CONTRACT-001',
  });
}

// ══════════════════════════════════════════════════════════════════
// P8: TED — listar-buzon
// Postman/playground: camelCase, nodos inboxType (cifrado) y clientId
// ══════════════════════════════════════════════════════════════════
function test_p8_ted() {
  const c = P.ted;
  return post(`${BASE}/v2/ted/listar-buzon`, c.clientId, {
    merchantIdentify: merchantIdentify(c),
    clientIdentify: {
      ipaddress: '127.0.0.1',
      browserAgent: 'Chrome 18.1.3',
      mobile: { manufacturer: 'Samsung' },
    },
    inboxType: enc('entrada', c.secretKey),
    clientId: c.merchantId,
  });
}

// ── Helpers ──
function extractCode(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (d.code !== undefined) return String(d.code);
    if (d.httpCode !== undefined) return String(d.httpCode);
  }
  return '-';
}

function extractErrorInfo(data: unknown): { code: string; error: string } {
  const code = extractCode(data);
  let error = '';
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (d.errorList) error = JSON.stringify(d.errorList);
    else if (d.moreInformation) error = String(d.moreInformation);
    else if (d.message) error = String(d.message);
    else if (d.httpMessage) error = String(d.httpMessage);
  } else if (typeof data === 'string') {
    error = data.substring(0, 120);
  }
  return { code, error };
}

function hasCreds(c: Creds): boolean {
  return !!(c.merchantId && c.secretKey && c.clientId);
}

// ── Run ──
async function main() {
  const tests = [
    { num: 1, name: 'Tarjetas getauth',          endpoint: '/v1/payment/getauth',         fn: test_p1_cards,          creds: P.cards },
    { num: 2, name: 'Pago Movil C2P',             endpoint: '/v1/payment/c2p',             fn: test_p2_c2p,            creds: P.c2p },
    { num: 3, name: 'Solicitud Clave C2P (SCP)',   endpoint: '/v1/mobile-payment/scp',      fn: test_p3_c2pKey,         creds: P.c2pKey },
    { num: 4, name: 'Busqueda Tarjetas',           endpoint: '/v1/payment/search',          fn: test_p4_searchCards,    creds: P.searchCards },
    { num: 5, name: 'Busqueda Movil',              endpoint: '/v1/mobile-payment/search',   fn: test_p5_searchMobile,   creds: P.searchMobile },
    { num: 6, name: 'Busqueda Transferencias',     endpoint: '/v1/payment/transfer-search', fn: test_p6_searchTransfer, creds: P.searchTransfer },
    { num: 7, name: 'Agendamiento (consult)',      endpoint: '/v1/payment/consult-contract',fn: test_p7_scheduling,     creds: P.scheduling },
    { num: 8, name: 'TED listar-buzon',            endpoint: '/v2/ted/listar-buzon',        fn: test_p8_ted,            creds: P.ted },
  ];

  console.log('');
  console.log('='.repeat(78));
  console.log('  MERCANTIL SANDBOX — PRUEBA CON ESTRUCTURAS CORREGIDAS');
  console.log(`  ${new Date().toISOString()}`);
  console.log('  FIX: P1-P5 snake_case (merchant_identify, ipaddress, browser_agent)');
  console.log('       P1 transaction_authInfo, P2 transaction_c2p, P3 transaction_scpInfo');
  console.log('       P4 search_by+procesing_date, P5 search_by+trx_date');
  console.log('       P8 TED inboxType+clientId');
  console.log('='.repeat(78));

  const results: { num: number; name: string; httpStatus: number; code: string; error: string; ms: number; hasCreds: boolean }[] = [];

  for (const t of tests) {
    console.log(`\n${'━'.repeat(78)}`);
    console.log(`  P${t.num}: ${t.name}`);
    console.log(`  Endpoint: ${t.endpoint}`);
    console.log(`  Client-Id: ${t.creds.clientId || '(NO CONFIGURADO)'}`);
    console.log('━'.repeat(78));

    if (!hasCreds(t.creds)) {
      console.log('  ⊘ SIN CREDENCIALES — omitido');
      results.push({ num: t.num, name: t.name, httpStatus: -1, code: 'N/A', error: 'Sin credenciales', ms: 0, hasCreds: false });
      continue;
    }

    const r = await t.fn();
    const { code, error } = extractErrorInfo(r.data);

    console.log(`\n  ▸ HTTP Status: ${r.status}`);
    console.log(`  ▸ Code: ${code}`);
    console.log(`  ▸ Tiempo: ${r.durationMs}ms`);
    if (error) console.log(`  ▸ Error/Info: ${error}`);

    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
    console.log(`  ▸ Response:\n${body.substring(0, 1500)}`);

    results.push({ num: t.num, name: t.name, httpStatus: r.status, code, error, ms: r.durationMs, hasCreds: true });
  }

  // ── Resumen ──
  console.log(`\n\n${'═'.repeat(78)}`);
  console.log('  RESUMEN — ANTES (500/99999 en todo) vs AHORA');
  console.log('═'.repeat(78));
  console.log('');
  console.log('  #  Producto                     HTTP   Code      Cambió?   Tiempo');
  console.log('  ' + '─'.repeat(74));

  for (const r of results) {
    if (!r.hasCreds) {
      console.log(`  ${r.num}  ${r.name.padEnd(28)} ---    N/A       ---       (sin creds)`);
      continue;
    }
    const changed = (r.httpStatus !== 500 || r.code !== '99999') ? '  SI' : '  NO';
    const marker = changed === '  SI' ? ' ★' : '';
    console.log(`  ${r.num}  ${r.name.padEnd(28)} ${String(r.httpStatus).padEnd(6)} ${r.code.padEnd(9)} ${changed}${marker}     ${r.ms}ms`);
  }

  console.log('  ' + '─'.repeat(74));
  const tested = results.filter(r => r.hasCreds);
  const changed = tested.filter(r => r.httpStatus !== 500 || r.code !== '99999');
  console.log(`\n  Productos probados: ${tested.length}/8`);
  console.log(`  Con cambio vs 500/99999: ${changed.length}`);
  if (changed.length === 0) {
    console.log('  → Todo sigue igual: 500/99999 en todos los productos.');
  } else {
    console.log('  → Productos con cambio (respuesta de negocio):');
    for (const c of changed) {
      console.log(`    ★ P${c.num} ${c.name}: HTTP ${c.httpStatus}, code ${c.code}`);
      if (c.error) console.log(`      ${c.error.substring(0, 100)}`);
    }
  }

  console.log(`\n${'═'.repeat(78)}\n`);
}

main().catch(console.error);
