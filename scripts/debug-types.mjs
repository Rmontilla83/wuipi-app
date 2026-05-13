// Test si Mercantil es sensitive a tipos: integratorId como number vs string.
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf-8").split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);
const TS_SECRET = env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY;
const TS_CLIENT = env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID;
const TS_BASE = env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || env.MERCANTIL_BASE_URL;
const PERSON = env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || "11269635";
const TERMINAL = env.MERCANTIL_TERMINAL_ID || "1";

function deriveKey(s) { return Buffer.from(crypto.createHash("sha256").update(s,"utf8").digest().toString("hex").substring(0,32), "hex"); }
function enc(v, s) { const k = deriveKey(s); const c = crypto.createCipheriv("aes-128-ecb", k, null); c.setAutoPadding(true); let e = c.update(v,"utf8","base64"); e += c.final("base64"); return e; }

const url = `${TS_BASE.replace(/\/$/,"")}/v1/payment/transfer-search`;
const cedulaEnc = enc("V16006905", TS_SECRET);
const acctEnc = enc("01050745651745103031", TS_SECRET);

const variants = [
  {
    name: "ORIGINAL — integratorId:31 (number), terminalId:'1'",
    integratorId: 31, terminalId: "1",
  },
  {
    name: "SDK style — integratorId:'31' (STRING), terminalId:'1'",
    integratorId: "31", terminalId: "1",
  },
  {
    name: "Both strings — integratorId:'31', merchantId:'11269635' as string, terminalId:'1'",
    integratorId: "31", terminalId: "1", merchantIdString: true,
  },
  {
    name: "Number merchantId — integratorId:31, merchantId:11269635 as number, terminalId:'1'",
    integratorId: 31, terminalId: "1", merchantIdNumber: true,
  },
];

for (const v of variants) {
  const merchantId = v.merchantIdString ? String(PERSON) :
                     v.merchantIdNumber ? Number(PERSON) : PERSON;
  const body = {
    merchantIdentify: { integratorId: v.integratorId, merchantId, terminalId: v.terminalId },
    clientIdentify: { ipAddress: "127.0.0.1", browserAgent: "Chrome 18.1.3", mobile: { manufacturer: "Samsung" } },
    transferSearchBy: {
      account: acctEnc, issuerCustomerId: cedulaEnc,
      trxDate: "2026-05-13", issuerBankId: 105, transactionType: 1,
      paymentReference: "72651965", amount: 106.81,
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
  console.log(`\n─── ${v.name} ───`);
  console.log(`merchantIdentify=${JSON.stringify(body.merchantIdentify)}`);
  console.log(`HTTP ${res.status} ${ms}ms`);
  try {
    const j = JSON.parse(text);
    if (j.transferSearchList) console.log(`✅ ${j.transferSearchList.length} resultado(s)`);
    else if (j.errorList) console.log(`❌ errorCode ${j.errorList[0]?.errorCode}: ${j.errorList[0]?.description}`);
  } catch {}
  await new Promise(r => setTimeout(r, 700));
}
