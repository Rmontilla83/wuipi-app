/**
 * Mercantil Sandbox — Prueba completa 8 productos + flujo getauth→pay.
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
function dec(ciphertext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(true);
  return decipher.update(ciphertext, 'base64', 'utf8') + decipher.final('utf8');
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

// P1-P5: snake_case
function merchant_identify(c: Creds) {
  return { integratorId: 31, merchantId: parseInt(c.merchantId, 10) || c.merchantId, terminalId: 'abcde' };
}
const client_identify = {
  ipaddress: '127.0.0.1',
  browser_agent: 'Chrome 18.1.3',
  mobile: { manufacturer: 'Samsung' },
};

// P6-P8: camelCase
function merchantIdentify(c: Creds) {
  return { integratorId: 31, merchantId: parseInt(c.merchantId, 10) || c.merchantId, terminalId: 'abcde' };
}
// P7 requiere model y osVersion
const clientIdentifyFull = {
  ipAddress: '127.0.0.1',
  browserAgent: 'Chrome 18.1.3',
  mobile: { manufacturer: 'Samsung', model: 'S9', osVersion: 'Android 14' },
};
const clientIdentify = {
  ipAddress: '127.0.0.1',
  browserAgent: 'Chrome 18.1.3',
  mobile: { manufacturer: 'Samsung' },
};

// ══════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + '='.repeat(78));
  console.log('  MERCANTIL SANDBOX — PRUEBAS COMPLETAS');
  console.log(`  ${new Date().toISOString()}`);
  console.log('='.repeat(78));

  // ────────────────────────────────────────────────────────────────
  // P1: FLUJO COMPLETO TARJETAS: getauth → pay
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log('  P1: FLUJO COMPLETO TARJETAS — getauth → pay');
  console.log('  Datos: V10780248, tarjeta 4532310053032530, venc 12/25, CVV 924');
  console.log('━'.repeat(78));

  const c1 = P.cards;

  // Paso 1: getauth
  console.log('\n  [Paso 1] getauth...');
  const auth = await post(`${BASE}/v1/payment/getauth`, c1.clientId, {
    merchant_identify: merchant_identify(c1),
    client_identify,
    transaction_authInfo: {
      trx_type: 'solaut',
      payment_method: 'tdd',
      customer_id: 'V10780248',
      card_number: '4532310053032530',
    },
  });
  console.log(`  HTTP: ${auth.status} | ${auth.durationMs}ms`);
  const authData = auth.data as Record<string, unknown>;
  const authInfo = authData?.authentication_info as Record<string, string> | undefined;

  if (auth.status === 200 && authInfo) {
    // Descifrar datos del 2FA
    try {
      const tfType = dec(authInfo.twofactor_type, c1.secretKey);
      const tfFieldType = dec(authInfo.twofactor_field_type, c1.secretKey);
      const tfLength = dec(authInfo.twofactor_lenght, c1.secretKey);
      console.log(`  2FA Type: ${tfType}`);
      console.log(`  2FA Field Type: ${tfFieldType}`);
      console.log(`  2FA Length: ${tfLength}`);
      console.log(`  2FA Label (cifrado): ${authInfo.twofactor_label}`);
      try {
        const tfLabel = dec(authInfo.twofactor_label, c1.secretKey);
        console.log(`  2FA Label (plano): ${tfLabel}`);
      } catch { console.log('  2FA Label: no se pudo descifrar'); }
    } catch (e) { console.log(`  Error descifrando 2FA: ${e}`); }

    // Paso 2: pay (TDD con OTP)
    console.log('\n  [Paso 2] pay (TDD)...');
    const pay = await post(`${BASE}/v1/payment/pay`, c1.clientId, {
      merchant_identify: merchant_identify(c1),
      client_identify,
      transaction: {
        trx_type: 'compra',
        payment_method: 'tdd',
        card_number: '4532310053032530',
        customer_id: 'V10780248',
        account_type: 'cc',
        expiration_date: '12/25',
        cvv: enc('924', c1.secretKey),
        currency: 'ves',
        amount: 50.00,
        invoice_number: `TEST-PAY-${Date.now()}`,
        twofactor_auth: enc('123456', c1.secretKey),
      },
    });
    console.log(`  HTTP: ${pay.status} | ${pay.durationMs}ms`);
    console.log(`  Response: ${JSON.stringify(pay.data, null, 2).substring(0, 800)}`);
  } else {
    console.log(`  getauth falló: ${JSON.stringify(auth.data, null, 2).substring(0, 500)}`);
  }

  // ────────────────────────────────────────────────────────────────
  // P2: C2P (para obtener referencia fresca)
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log('  P2: Pago Movil C2P (referencia fresca)');
  console.log('━'.repeat(78));

  const c2p = await post(`${BASE}/v1/payment/c2p`, P.c2p.clientId, {
    merchant_identify: merchant_identify(P.c2p),
    client_identify,
    transaction_c2p: {
      amount: 150.00,
      currency: 'ves',
      destination_bank_id: 105,
      destination_id: enc('V18367443', P.c2p.secretKey),
      origin_mobile_number: enc('584142591177', P.c2p.secretKey),
      destination_mobile_number: enc('584241513063', P.c2p.secretKey),
      trx_type: 'compra',
      payment_method: 'c2p',
      invoice_number: `TEST-C2P-${Date.now()}`,
      twofactor_auth: enc('00001111', P.c2p.secretKey),
    },
  });
  console.log(`  HTTP: ${c2p.status} | ${c2p.durationMs}ms`);
  const c2pData = c2p.data as Record<string, unknown>;
  const c2pResp = c2pData?.transaction_c2p_response as Record<string, unknown> | undefined;
  const c2pRef = c2pResp?.payment_reference ? String(c2pResp.payment_reference) : '6460003485';
  const c2pInvoice = c2pResp?.invoice_number ? String(c2pResp.invoice_number) : '';
  console.log(`  Status: ${c2pResp?.trx_status} | Ref: ${c2pRef} | Invoice: ${c2pInvoice}`);

  // ────────────────────────────────────────────────────────────────
  // P3: SCP
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log('  P3: Solicitud Clave C2P');
  console.log('━'.repeat(78));

  const scp = await post(`${BASE}/v1/mobile-payment/scp`, P.c2pKey.clientId, {
    merchant_identify: merchant_identify(P.c2pKey),
    client_identify,
    transaction_scpInfo: {
      destination_id: enc('V18367443', P.c2pKey.secretKey),
      destination_mobile_number: enc('584241513063', P.c2pKey.secretKey),
    },
  });
  console.log(`  HTTP: ${scp.status} | ${scp.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(scp.data, null, 2).substring(0, 300)}`);

  // ────────────────────────────────────────────────────────────────
  // P4: BÚSQUEDA TARJETAS — con ref del C2P exitoso
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log(`  P4: Búsqueda Tarjetas — ref C2P: ${c2pRef}, fecha hoy`);
  console.log('━'.repeat(78));

  const p4 = await post(`${BASE}/v1/payment/search`, P.searchCards.clientId, {
    merchant_identify: { integratorId: '31', merchantId: P.searchCards.merchantId, terminalId: 'abcde' },
    client_identify,
    search_by: {
      search_criteria: 'unique',
      procesing_date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
      invoice_number: c2pInvoice,
      payment_reference: c2pRef,
    },
  });
  console.log(`  HTTP: ${p4.status} | ${p4.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(p4.data, null, 2).substring(0, 500)}`);

  // ────────────────────────────────────────────────────────────────
  // P5: BÚSQUEDA MÓVIL — con ref del C2P exitoso
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log(`  P5: Búsqueda Móvil — ref: ${c2pRef}, fecha hoy`);
  console.log('━'.repeat(78));

  const p5 = await post(`${BASE}/v1/mobile-payment/search`, P.searchMobile.clientId, {
    merchant_identify: merchant_identify(P.searchMobile),
    client_identify,
    search_by: {
      amount: 150.00,
      currency: 'ves',
      destination_mobile_number: enc('584241513063', P.searchMobile.secretKey),
      origin_mobile_number: enc('584142591177', P.searchMobile.secretKey),
      payment_reference: c2pRef,
      trx_date: new Date().toISOString().slice(0, 10),
    },
  });
  console.log(`  HTTP: ${p5.status} | ${p5.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(p5.data, null, 2).substring(0, 800)}`);

  // P5b: con referencia del xlsx (87860014874)
  console.log('\n  P5b: Búsqueda Móvil — ref xlsx 87860014874, fecha 2026-03-03');
  const p5b = await post(`${BASE}/v1/mobile-payment/search`, P.searchMobile.clientId, {
    merchant_identify: merchant_identify(P.searchMobile),
    client_identify,
    search_by: {
      amount: 0,
      currency: 'ves',
      destination_mobile_number: '',
      origin_mobile_number: '',
      payment_reference: '87860014874',
      trx_date: '2026-03-03',
    },
  });
  console.log(`  HTTP: ${p5b.status} | ${p5b.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(p5b.data, null, 2).substring(0, 800)}`);

  // ────────────────────────────────────────────────────────────────
  // P6: Búsqueda Transferencias (datos Mercantil — ya funciona)
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log('  P6: Búsqueda Transferencias — datos Mercantil');
  console.log('━'.repeat(78));

  const p6 = await post(`${BASE}/v1/payment/transfer-search`, P.searchTransfer.clientId, {
    merchantIdentify: merchantIdentify(P.searchTransfer),
    clientIdentify,
    transferSearchBy: {
      account: 'N1IH8GqG9krQTx24fwpq27oSCleBHZ2uJbMFId4jc/s=',
      issuerCustomerId: '8jhYIu6i+d3eIwcz5mKbaw==',
      trxDate: '2026-03-13',
      issuerBankId: 105,
      transactionType: 1,
      paymentReference: '16556116',
      amount: 1250,
    },
  });
  console.log(`  HTTP: ${p6.status} | ${p6.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(p6.data, null, 2).substring(0, 500)}`);

  // ────────────────────────────────────────────────────────────────
  // P7: AGENDAMIENTO — con model y osVersion
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log('  P7: Agendamiento — consult-contract (con model+osVersion)');
  console.log('━'.repeat(78));

  const p7 = await post(`${BASE}/v1/payment/consult-contract`, P.scheduling.clientId, {
    merchantIdentify: merchantIdentify(P.scheduling),
    clientIdentify: clientIdentifyFull,
    consultContract: {
      contractNumber: enc('12345', P.scheduling.secretKey),
    },
  });
  console.log(`  HTTP: ${p7.status} | ${p7.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(p7.data, null, 2).substring(0, 500)}`);

  // ────────────────────────────────────────────────────────────────
  // P8: TED (ya funciona)
  // ────────────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78));
  console.log('  P8: TED listar-buzon');
  console.log('━'.repeat(78));

  const p8 = await post(`${BASE}/v2/ted/listar-buzon`, P.ted.clientId, {
    merchantIdentify: merchantIdentify(P.ted),
    clientIdentify: { ipaddress: '127.0.0.1', browserAgent: 'Chrome 18.1.3', mobile: { manufacturer: 'Samsung' } },
    inboxType: enc('entrada', P.ted.secretKey),
    clientId: P.ted.merchantId,
  });
  console.log(`  HTTP: ${p8.status} | ${p8.durationMs}ms`);
  console.log(`  Response: ${JSON.stringify(p8.data, null, 2).substring(0, 300)}`);

  // ── RESUMEN ──
  const all = [
    { num: '1-auth', http: auth.status, name: 'getauth' },
    { num: '1-pay', http: (auth.status === 200 ? ((auth.data as Record<string, unknown>)?.authentication_info ? 'tested' : 'skip') : 'skip') as string | number, name: 'pay' },
    { num: '2', http: c2p.status, name: 'C2P' },
    { num: '3', http: scp.status, name: 'SCP' },
    { num: '4', http: p4.status, name: 'Busq Tarjetas' },
    { num: '5', http: p5.status, name: 'Busq Movil' },
    { num: '6', http: p6.status, name: 'Busq Transferencias' },
    { num: '7', http: p7.status, name: 'Agendamiento' },
    { num: '8', http: p8.status, name: 'TED' },
  ];

  console.log('\n\n' + '═'.repeat(78));
  console.log('  RESUMEN FINAL');
  console.log('═'.repeat(78) + '\n');
  for (const t of all) {
    const icon = t.http === 200 ? '✓' : (typeof t.http === 'number' && t.http === 400 ? '~' : '✗');
    console.log(`  ${icon} P${t.num}: ${t.name} — HTTP ${t.http}`);
  }
  console.log('\n' + '═'.repeat(78) + '\n');
}

main().catch(console.error);
