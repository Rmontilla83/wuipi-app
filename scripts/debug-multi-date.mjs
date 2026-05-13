// Reproduce el error HTTP 400 que ve producción al probar transfer-search
// con trxDate=hoy (cuando la trx fue hace 2 días). Compara con trxDate=2026-05-11
// que sabemos devuelve 200.

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);
const TS_SECRET = env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY;
const TS_CLIENT = env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID;
const TS_BASE   = env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || env.MERCANTIL_BASE_URL;
const PERSON    = env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || "11269635";

function deriveKey(s) { return Buffer.from(crypto.createHash("sha256").update(s,"utf8").digest().toString("hex").substring(0,32), "hex"); }
function enc(v, s) { const k = deriveKey(s); const c = crypto.createCipheriv("aes-128-ecb", k, null); c.setAutoPadding(true); let e = c.update(v,"utf8","base64"); e += c.final("base64"); return e; }

const url = `${TS_BASE.replace(/\/$/,"")}/v1/payment/transfer-search`;
const ourAccount = "01050745651745103031";
const cedulaEnc  = enc("V16006905", TS_SECRET);
const acctEnc    = enc(ourAccount, TS_SECRET);

const DATES = ["2026-05-13", "2026-05-12", "2026-05-11"];

for (const trxDate of DATES) {
  const body = {
    merchantIdentify: { integratorId: 31, merchantId: PERSON, terminalId: "1" },
    clientIdentify: { ipAddress: "127.0.0.1", browserAgent: "Chrome 18.1.3", mobile: { manufacturer: "Samsung" } },
    transferSearchBy: {
      account: acctEnc, issuerCustomerId: cedulaEnc,
      trxDate, issuerBankId: 105, transactionType: 1,
      paymentReference: "06431847", amount: 80.07,
    },
  };
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-IBM-Client-Id": TS_CLIENT },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  console.log(`\n=== trxDate=${trxDate} → HTTP ${res.status} (${ms}ms) gtid=${res.headers.get("x-global-transaction-id")}`);
  try {
    const j = JSON.parse(text);
    console.log(JSON.stringify(j, null, 2));
  } catch {
    console.log(text.slice(0, 800));
  }
  await new Promise(r => setTimeout(r, 800));
}
