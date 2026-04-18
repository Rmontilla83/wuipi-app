/**
 * Diagnostic v2 — transfer-search prod. Prueba posiciones del personId.
 */

import crypto from "crypto";

function deriveKey(secretKey: string): Buffer {
  const hash = crypto.createHash("sha256").update(secretKey, "utf8").digest();
  const hexString = hash.toString("hex");
  return Buffer.from(hexString.slice(0, hexString.length / 2), "hex");
}

function enc(plaintext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  return cipher.update(plaintext, "utf8", "base64") + cipher.final("base64");
}

const merchantId = process.env.MERCANTIL_SEARCH_TRANSFER_MERCHANT_ID || "";
const secretKey = process.env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY || "";
const clientId = process.env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID || "";
const baseUrl = process.env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || "";
const integratorId = parseInt(process.env.MERCANTIL_INTEGRATOR_ID || "31", 10);
const terminalId = process.env.MERCANTIL_TERMINAL_ID || "";
const personNumber = "11269635"; // dado por Mercantil para transfer-search

const WUIPI_ACCOUNT = "01050745651745103031";
const CUSTOMER_CEDULA = "16006905";
const REFERENCE = "0025583242567";
const TODAY = new Date().toISOString().split("T")[0];

async function probe(label: string, body: Record<string, unknown>) {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/payment/transfer-search`;
  console.log(`\n━━━ ${label} ━━━`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-IBM-Client-Id": clientId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }

  console.log(`status=${res.status}  body=${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
}

async function main() {
  if (!merchantId || !secretKey || !clientId || !baseUrl) {
    console.error("Faltan env vars");
    process.exit(1);
  }

  const encAccount = enc(WUIPI_ACCOUNT, secretKey);
  const encCedula = enc(CUSTOMER_CEDULA, secretKey);

  const baseIdentify = {
    integratorId,
    merchantId: parseInt(merchantId, 10) || merchantId,
    terminalId,
  };
  const baseClient = {
    ipAddress: "127.0.0.1",
    browserAgent: "Mozilla/5.0",
  };
  const baseSearch = {
    account: encAccount,
    issuerCustomerId: encCedula,
    trxDate: TODAY,
    issuerBankId: 105,
    transactionType: 1,
    paymentReference: REFERENCE,
    amount: 0.79,
  };

  // ── A: personNumber encrypted en transferSearchBy ──
  await probe("A: transferSearchBy.personNumber (cifrado)", {
    merchantIdentify: baseIdentify,
    clientIdentify: baseClient,
    transferSearchBy: {
      ...baseSearch,
      personNumber: enc(personNumber, secretKey),
    },
  });

  // ── B: personId plano en transferSearchBy ──
  await probe("B: transferSearchBy.personId (plano)", {
    merchantIdentify: baseIdentify,
    clientIdentify: baseClient,
    transferSearchBy: {
      ...baseSearch,
      personId: personNumber,
    },
  });

  // ── C: personNumber en merchantIdentify ──
  await probe("C: merchantIdentify.personNumber", {
    merchantIdentify: { ...baseIdentify, personNumber },
    clientIdentify: baseClient,
    transferSearchBy: baseSearch,
  });

  // ── D: issuerPersonNumber (el emisor es el cliente) ──
  await probe("D: transferSearchBy.issuerPersonNumber encrypted", {
    merchantIdentify: baseIdentify,
    clientIdentify: baseClient,
    transferSearchBy: {
      ...baseSearch,
      issuerPersonNumber: enc(personNumber, secretKey),
    },
  });

  // ── E: personNumber como issuerCustomerId (¿quizás la "persona" es Wuipi?) ──
  await probe("E: issuerCustomerId = personNumber Wuipi (encrypted)", {
    merchantIdentify: baseIdentify,
    clientIdentify: baseClient,
    transferSearchBy: {
      ...baseSearch,
      issuerCustomerId: enc(personNumber, secretKey), // Wuipi como emisor
    },
  });

  // ── F: account = personNumber (¿quizás el "account" para transfer-search es la persona?) ──
  await probe("F: account = personNumber Wuipi (encrypted)", {
    merchantIdentify: baseIdentify,
    clientIdentify: baseClient,
    transferSearchBy: {
      ...baseSearch,
      account: enc(personNumber, secretKey),
    },
  });
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
