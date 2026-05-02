// Test rapido transfer-search prod hoy. Usa datos del pago real reciente:
// referenciaBancoOrdenante=000000031187535, monto 282 Bs, banco origen 0172 Bancamiga
// Si responde transactions[0] -> transfer-search funciona, podemos auto-verify
// Si responde code=99999 -> sigue bloqueado, necesitamos Opcion B

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(readFileSync(".env.local", "utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; }));

const TS_MERCHANT = env.MERCANTIL_SEARCH_TRANSFER_MERCHANT_ID;
const TS_SECRET = env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY;
const TS_CLIENT = env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID;
const TS_BASE = env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || env.MERCANTIL_BASE_URL;

console.log("Config transfer_search:");
console.log("  merchantId:", TS_MERCHANT);
console.log("  secret length:", TS_SECRET?.length);
console.log("  clientId:", TS_CLIENT);
console.log("  baseUrl:", TS_BASE);

if (!TS_MERCHANT || !TS_SECRET || !TS_CLIENT || !TS_BASE) {
  console.error("\n❌ Faltan credenciales de transfer_search en .env.local");
  process.exit(1);
}

// AES-128 ECB (igual que el SDK)
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

// Cuenta destino: la nuestra Mercantil (3031)
const ourAccount = "01050745651745103031";
// idComercio: el VAT/RIF de WUIPI sin formato
const ourRif = "J411567710";

// Datos del pago real reciente
const params = {
  account: ourAccount,
  issuerCustomerId: ourRif,
  trxDate: "2026-04-29",
  issuerBankId: 105,            // Mercantil (banco beneficiario)
  transactionType: 1,
  paymentReference: "000000031187535",
  amount: 544.54,
};

const body = {
  merchantIdentify: {
    integratorId: env.MERCANTIL_INTEGRATOR_ID || "31",
    merchantId: TS_MERCHANT,
    terminalId: env.MERCANTIL_TERMINAL_ID || "1",
  },
  clientIdentify: {
    ipAddress: "127.0.0.1",
    browserAgent: "Mozilla/5.0",
  },
  transferSearchBy: {
    account: encryptField(params.account, TS_SECRET),
    issuerCustomerId: encryptField(params.issuerCustomerId, TS_SECRET),
    trxDate: params.trxDate,
    issuerBankId: params.issuerBankId,
    transactionType: params.transactionType,
    paymentReference: params.paymentReference,
    amount: params.amount,
  },
};

const url = `${TS_BASE.replace(/\/$/, "")}/v1/payment/transfer-search`;
console.log(`\nPOST ${url}`);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-IBM-Client-Id": TS_CLIENT,
  },
  body: JSON.stringify(body),
});

console.log(`\nStatus: ${res.status} ${res.statusText}`);
console.log(`x-global-transaction-id: ${res.headers.get("x-global-transaction-id")}`);

const text = await res.text();
console.log(`\nResponse body:`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
