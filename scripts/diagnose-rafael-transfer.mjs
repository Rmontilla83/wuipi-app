// Replica el intento real de Rafael (2026-05-11 18:58 UTC) y prueba 5
// variantes para aislar la causa del HTTP 500 de Mercantil transfer-search.
//
// Datos exactos del intento (de payment_gateway_logs):
//   ref bancaria: 0025506431847  (13 digitos -> truncated a 06431847)
//   monto:        80.07 Bs  ($0.16 USD a BCV 500.4606)
//   banco origen: 0105 Mercantil
//   cedula emisor: 16006905  (V-16.006.905)
//   fecha:        2026-05-11
//   cuenta destino: 01050745651745103031 (Wuipi Mercantil)
//
// Imprime: status, gtid, headers, body completo para cada variante.

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const TS_MERCHANT_PERSON = env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER; // 11269635
const TS_SECRET   = env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY;
const TS_CLIENT   = env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID;
const TS_BASE     = env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || env.MERCANTIL_BASE_URL;
const INTEGRATOR  = env.MERCANTIL_INTEGRATOR_ID || "31";
const TERMINAL    = env.MERCANTIL_TERMINAL_ID || "1";

console.log("=== Config transfer_search (con fix 2026-05-05) ===");
console.log("  merchantId person:", TS_MERCHANT_PERSON);
console.log("  secret length:    ", TS_SECRET?.length);
console.log("  clientId:         ", TS_CLIENT?.slice(0,8) + "..." + TS_CLIENT?.slice(-6));
console.log("  baseUrl:          ", TS_BASE);
console.log("  integratorId:     ", INTEGRATOR);
console.log("  terminalId:       ", TERMINAL);

if (!TS_MERCHANT_PERSON || !TS_SECRET || !TS_CLIENT || !TS_BASE) {
  console.error("\n[X] Faltan credenciales transfer_search o PERSON_NUMBER en .env.local");
  process.exit(1);
}

function deriveKey(secret) {
  const hash = crypto.createHash("sha256").update(secret, "utf8").digest();
  return Buffer.from(hash.toString("hex").substring(0, 32), "hex");
}
function encryptField(value, secret) {
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  let enc = cipher.update(value, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
}
function last8(ref) {
  const d = String(ref).replace(/\D/g, "");
  return d.length > 8 ? d.slice(-8) : d;
}

const url = `${TS_BASE.replace(/\/$/, "")}/v1/payment/transfer-search`;
const ourAccount = "01050745651745103031";
const cedula     = "16006905";
const refFull    = "0025506431847";
const refLast8   = last8(refFull);

const merchantIdentify = {
  integratorId: INTEGRATOR,
  merchantId:   TS_MERCHANT_PERSON,
  terminalId:   TERMINAL,
};
const clientIdentify = {
  ipAddress:    "127.0.0.1",
  browserAgent: "Mozilla/5.0",
};

const baseSearch = {
  account:          encryptField(ourAccount, TS_SECRET),
  issuerCustomerId: encryptField(cedula,    TS_SECRET),
  trxDate:          "2026-05-11",
  issuerBankId:     105,
  transactionType:  1,
  paymentReference: refLast8,
  amount:           80.07,
};

const variants = [
  {
    name: "V1 — Replica exacta de produccion (con 3 fixes)",
    body: { merchantIdentify, clientIdentify, transferSearchBy: { ...baseSearch } },
  },
  {
    name: "V2 — Referencia COMPLETA (sin truncar a 8)",
    body: { merchantIdentify, clientIdentify, transferSearchBy: { ...baseSearch, paymentReference: refFull } },
  },
  {
    name: "V3 — Sin paymentReference",
    body: { merchantIdentify, clientIdentify, transferSearchBy: (() => { const x = { ...baseSearch }; delete x.paymentReference; return x; })() },
  },
  {
    name: "V4 — Sin amount (busqueda solo por ref + cuenta + cedula)",
    body: { merchantIdentify, clientIdentify, transferSearchBy: (() => { const x = { ...baseSearch }; delete x.amount; return x; })() },
  },
  {
    name: "V5 — issuerBankId como string '0105' (no integer 105)",
    body: { merchantIdentify, clientIdentify, transferSearchBy: { ...baseSearch, issuerBankId: "0105" } },
  },
  {
    name: "V6 — transactionType=2",
    body: { merchantIdentify, clientIdentify, transferSearchBy: { ...baseSearch, transactionType: 2 } },
  },
  {
    name: "V7 — trxDate ayer 2026-05-10",
    body: { merchantIdentify, clientIdentify, transferSearchBy: { ...baseSearch, trxDate: "2026-05-10" } },
  },
];

console.log(`\n=== Endpoint: ${url} ===`);
console.log(`=== ref completa: ${refFull} | last8: ${refLast8} ===`);
console.log(`=== ${variants.length} variantes a probar (serial, 1s delay) ===\n`);

for (const v of variants) {
  console.log(`\n────────────────────────────────────────────────`);
  console.log(`▶ ${v.name}`);
  console.log(`  transferSearchBy:`, {
    ...v.body.transferSearchBy,
    account: v.body.transferSearchBy.account ? "[encrypted]" : "(none)",
    issuerCustomerId: v.body.transferSearchBy.issuerCustomerId ? "[encrypted]" : "(none)",
  });

  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-IBM-Client-Id": TS_CLIENT },
      body:    JSON.stringify(v.body),
    });

    const ms = Date.now() - t0;
    const text = await res.text();
    console.log(`  ⏱ ${ms}ms  HTTP ${res.status} ${res.statusText}`);
    console.log(`  gtid: ${res.headers.get("x-global-transaction-id") || "(none)"}`);
    console.log(`  request-id: ${res.headers.get("x-request-id") || "(none)"}`);

    try {
      const json = JSON.parse(text);
      console.log(`  body:`, JSON.stringify(json, null, 2).split("\n").map(l => "    " + l).join("\n"));
    } catch {
      console.log(`  body (raw, ${text.length} bytes):`);
      console.log("    " + (text.slice(0, 800).replace(/\n/g, "\n    ")));
      if (text.length > 800) console.log(`    ...[+${text.length - 800} more bytes]`);
    }
  } catch (err) {
    console.log(`  [X] fetch error:`, err?.message || err);
  }

  await new Promise(r => setTimeout(r, 1000));
}

console.log(`\n=== FIN ===\n`);
