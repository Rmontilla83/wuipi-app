// Ronda 2: variar identidad (merchantId, integratorId, terminalId)
// Hipotesis: code 99999 + personId:"0" en respuesta indica que Mercantil
// no resuelve nuestra identidad. La secret key se compone de:
//   "0011269635J000000411567710201806210262"
//    └personId┘└──── J + RIF padded ────┘└── fecha? ──┘
// → Probemos varias formas de mandar el merchantId.

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const TS_SECRET    = env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY;
const TS_CLIENT    = env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID;
const TS_BASE      = env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || env.MERCANTIL_BASE_URL;
const TS_PRODUCT_MERCHANT = env.MERCANTIL_SEARCH_TRANSFER_MERCHANT_ID; // 217546

// NO imprimir el secret completo (fuga a logs de terminal/CI). Solo metadatos.
console.log("=== Secret key (enmascarada) ===");
console.log("  secret:", TS_SECRET ? `${TS_SECRET.slice(0,4)}…${TS_SECRET.slice(-4)} (len ${TS_SECRET.length})` : "(no set)");

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

const url = `${TS_BASE.replace(/\/$/, "")}/v1/payment/transfer-search`;
const ourAccount = "01050745651745103031";
const cedula     = "16006905";

const baseSearch = {
  account:          encryptField(ourAccount, TS_SECRET),
  issuerCustomerId: encryptField(cedula,     TS_SECRET),
  trxDate:          "2026-05-11",
  issuerBankId:     105,
  transactionType:  1,
  paymentReference: "06431847",
  amount:           80.07,
};

// 11 variantes de identidad
const identityVariants = [
  { name: "V8  — merchantId padded 0011269635",       integratorId: "31",  merchantId: "0011269635", terminalId: "1" },
  { name: "V9  — merchantId = RIF J411567710",        integratorId: "31",  merchantId: "J411567710", terminalId: "1" },
  { name: "V10 — merchantId = 217546 (product std)",  integratorId: "31",  merchantId: TS_PRODUCT_MERCHANT, terminalId: "1" },
  { name: "V11 — merchantId 11269635 + integratorId numero 31",  integratorId: 31,    merchantId: "11269635", terminalId: "1" },
  { name: "V12 — merchantId 11269635 + terminalId numero 1",     integratorId: "31",  merchantId: "11269635", terminalId: 1 },
  { name: "V13 — todo numero (integratorId, merchantId, terminalId)", integratorId: 31, merchantId: 11269635, terminalId: 1 },
  { name: "V14 — merchantId 11269635 + integratorId 0031",       integratorId: "0031", merchantId: "11269635", terminalId: "1" },
  { name: "V15 — merchantId = 411567710 (RIF sin J)",            integratorId: "31",  merchantId: "411567710", terminalId: "1" },
  { name: "V16 — merchantId 11269635 + terminalId 0001",         integratorId: "31",  merchantId: "11269635", terminalId: "0001" },
  { name: "V17 — RIF entero del secret key J000000411567710",    integratorId: "31",  merchantId: "J000000411567710", terminalId: "1" },
  { name: "V18 — Mezcla compuesta 11269635J411567710",           integratorId: "31",  merchantId: "11269635J411567710", terminalId: "1" },
];

console.log(`\n=== Endpoint: ${url} ===`);
console.log(`=== Probando ${identityVariants.length} variantes de identidad ===\n`);

for (const v of identityVariants) {
  console.log(`\n────────────────────────────────────────────────`);
  console.log(`▶ ${v.name}`);
  console.log(`  integratorId=${JSON.stringify(v.integratorId)} merchantId=${JSON.stringify(v.merchantId)} terminalId=${JSON.stringify(v.terminalId)}`);

  const body = {
    merchantIdentify: { integratorId: v.integratorId, merchantId: v.merchantId, terminalId: v.terminalId },
    clientIdentify:   { ipAddress: "127.0.0.1", browserAgent: "Mozilla/5.0" },
    transferSearchBy: baseSearch,
  };

  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-IBM-Client-Id": TS_CLIENT },
      body:    JSON.stringify(body),
    });
    const ms   = Date.now() - t0;
    const text = await res.text();
    console.log(`  ⏱ ${ms}ms  HTTP ${res.status}`);
    console.log(`  gtid: ${res.headers.get("x-global-transaction-id") || "(none)"}`);

    try {
      const json = JSON.parse(text);
      // detectar codes distintos a 99999
      const code = json.code !== undefined ? json.code : "(none)";
      const isInteresting = code !== 99999;
      const marker = isInteresting ? "  ⚠️  DIFERENTE  ⚠️" : "";
      console.log(`  code: ${code}${marker}`);
      if (isInteresting || json.transactions || json.message) {
        console.log(`  body:`, JSON.stringify(json, null, 2).split("\n").map(l => "    " + l).join("\n"));
      } else {
        // solo mostrar resumen para 99999 repetidos
        console.log(`  body: { code: 99999, processingDate: ${json.processingDate}, guId: ${json.infoMsg?.guId}, personId: ${json.infoMsg?.personId} }`);
      }
    } catch {
      console.log(`  body raw:`, text.slice(0, 400));
    }
  } catch (err) {
    console.log(`  [X] fetch error:`, err?.message || err);
  }
  await new Promise(r => setTimeout(r, 800));
}

console.log(`\n=== FIN ronda 2 ===\n`);
