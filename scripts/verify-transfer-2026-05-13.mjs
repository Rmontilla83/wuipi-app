// Validar fixes Mercantil 2026-05-13:
//   #3 — clientIdentify.mobile.manufacturer (sin él → 9999 por estructura)
//   #4 — issuerCustomerId formato compacto V17123456 (sin guiones/puntos)
//
// Usa los datos reales de la transferencia del 2026-05-11 (Bs 80.07) que
// llegó a la cuenta Wuipi y nunca fue matcheada por el API.
//
// Corre tres variantes A/B/C para confirmar exactamente cuál fix lo
// resuelve:
//   A. SIN fixes (replica pruebas previas)
//   B. con fix #3 (mobile)
//   C. con fix #3 + #4 (mobile + V16006905)

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8")
    .split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);

const TS_SECRET   = env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY;
const TS_CLIENT   = env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID;
const TS_BASE     = env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || env.MERCANTIL_BASE_URL;
const PERSON_NUM  = env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || "11269635";

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
function normalizeIssuerCustomerId(value) {
  if (!value) return "";
  const letter = (value.match(/[A-Za-z]/)?.[0] || "V").toUpperCase();
  const digits = value.replace(/\D/g, "");
  return letter + digits;
}

const url        = `${TS_BASE.replace(/\/$/, "")}/v1/payment/transfer-search`;
const ourAccount = "01050745651745103031";

// Datos reales de la transferencia (2026-05-11)
const TX = {
  trxDate:          "2026-05-11",
  issuerBankId:     105,
  transactionType:  1,
  paymentReference: "06431847", // ultimos 8 digitos
  amount:           80.07,
};

const VARIANTS = [
  {
    name: "A — SIN fixes (replica error 9999)",
    issuerCustomerId: "16006905",       // sin letra (como veniamos mandando)
    includeMobile: false,
  },
  {
    name: "B — fix #3 (mobile)",
    issuerCustomerId: "16006905",       // todavia sin letra
    includeMobile: true,
  },
  {
    name: "C — fix #3 + #4 (mobile + V16006905)",
    issuerCustomerId: normalizeIssuerCustomerId("V-16.006.905"),
    includeMobile: true,
  },
];

console.log(`=== Endpoint: ${url}`);
console.log(`=== merchantId: ${PERSON_NUM} (override MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER)`);
console.log(`=== TX: trxDate=${TX.trxDate} bank=${TX.issuerBankId} ref=${TX.paymentReference} amount=${TX.amount}`);
console.log(`=== Probando ${VARIANTS.length} variantes\n`);

for (const v of VARIANTS) {
  console.log(`────────────────────────────────────────────────`);
  console.log(`▶ ${v.name}`);
  console.log(`  issuerCustomerId (plano): ${v.issuerCustomerId}`);
  console.log(`  includeMobile: ${v.includeMobile}`);

  const clientIdentify = {
    ipAddress: "127.0.0.1",
    browserAgent: "Chrome 18.1.3",
  };
  if (v.includeMobile) clientIdentify.mobile = { manufacturer: "Samsung" };

  const body = {
    merchantIdentify: { integratorId: 31, merchantId: PERSON_NUM, terminalId: "1" },
    clientIdentify,
    transferSearchBy: {
      account:          encryptField(ourAccount, TS_SECRET),
      issuerCustomerId: encryptField(v.issuerCustomerId, TS_SECRET),
      trxDate:          TX.trxDate,
      issuerBankId:     TX.issuerBankId,
      transactionType:  TX.transactionType,
      paymentReference: TX.paymentReference,
      amount:           TX.amount,
    },
  };

  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-IBM-Client-Id": TS_CLIENT },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    const text = await res.text();
    console.log(`  ⏱ ${ms}ms  HTTP ${res.status}  gtid: ${res.headers.get("x-global-transaction-id") || "(none)"}`);
    try {
      const json = JSON.parse(text);
      console.log(`  body:`, JSON.stringify(json, null, 2).split("\n").map(l => "    " + l).join("\n"));
    } catch {
      console.log(`  body raw:`, text.slice(0, 400));
    }
  } catch (err) {
    console.log(`  [X] fetch error:`, err?.message || err);
  }
  console.log("");
  await new Promise(r => setTimeout(r, 1000));
}

console.log("=== FIN ===");
