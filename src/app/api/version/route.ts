// GET /api/version — endpoint de diagnostico del deploy.
// Devuelve un marker unico y commit info para confirmar inequivocamente
// qué bundle esta sirviendo Vercel en cada deploy.
//
// Con `?test-transfer` ejecuta una búsqueda real contra Mercantil con
// valores hardcoded y devuelve body+response. Útil para debug E2E.
//
// Publico. Sin auth. No tocar logica de negocio.

export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const DEPLOY_MARKER = "PAY_CONFIRM_v2026_05_13_DUCKTYPE_2";

function fingerprint(value: string | undefined): { len: number; tail6: string; sha256_first16: string } {
  if (!value) return { len: 0, tail6: "", sha256_first16: "" };
  return {
    len: value.length,
    tail6: value.slice(-6),
    sha256_first16: crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16),
  };
}

// Reproducir la encripción del SDK localmente (no depender de @/lib/mercantil
// que tiene side-effects de logging).
function deriveKey(secret: string): Buffer {
  return Buffer.from(crypto.createHash("sha256").update(secret, "utf8").digest().toString("hex").slice(0, 32), "hex");
}
function encField(value: string, secret: string): string {
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true);
  let enc = cipher.update(value, "utf8", "base64");
  enc += cipher.final("base64");
  return enc;
}

export async function GET(request: NextRequest) {
  console.log(`[/api/version] hit | marker=${DEPLOY_MARKER}`);

  const { searchParams } = new URL(request.url);
  const testTransfer = searchParams.get("test-transfer") === "1";
  const testTransferSdk = searchParams.get("test-transfer") === "sdk";

  const baseResponse = {
    marker: DEPLOY_MARKER,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    deployment_url: process.env.VERCEL_URL || "unknown",
    region: process.env.VERCEL_REGION || "unknown",
    built_at: new Date().toISOString(),
    mercantil_env: {
      person_number: process.env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || null,
      transfer_secret_key_fp: fingerprint(process.env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY),
      transfer_client_id_fp: fingerprint(process.env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID),
      transfer_merchant_id: process.env.MERCANTIL_SEARCH_TRANSFER_MERCHANT_ID || null,
      transfer_base_url: process.env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || null,
      base_url: process.env.MERCANTIL_BASE_URL || null,
    },
  };

  if (!testTransfer && !testTransferSdk) {
    return NextResponse.json(baseResponse);
  }

  // Modo SDK: usar la lib real (MercantilSDK + searchTransfers) con los mismos
  // valores raw que /pay/confirm pasa. Si esto falla con HTTP 400 y el modo
  // hardcoded da HTTP 200, sabemos que el SDK arma body distinto.
  if (testTransferSdk) {
    try {
      const { MercantilSDK } = await import("@/lib/mercantil");
      const sdk = new MercantilSDK();
      const t0 = Date.now();
      try {
        const results = await sdk.searchTransfers({
          account: "01050745651745103031",
          issuerCustomerId: "16006905", // mismo input raw que llega de Supabase
          trxDate: "2026-05-13",
          issuerBankId: 105,
          transactionType: 1,
          paymentReference: "0025572651965", // referencia completa, SDK la trunca
          amount: 106.81,
        });
        return NextResponse.json({
          ...baseResponse,
          test_transfer_sdk: {
            duration_ms: Date.now() - t0,
            results_count: results.length,
            results,
          },
        });
      } catch (err) {
        const e = err as { message?: string; status?: number; details?: unknown };
        return NextResponse.json({
          ...baseResponse,
          test_transfer_sdk: {
            duration_ms: Date.now() - t0,
            sdk_threw: true,
            status: e.status,
            message: e.message,
            details: e.details,
          },
        });
      }
    } catch (err) {
      return NextResponse.json({
        ...baseResponse,
        test_transfer_sdk_error: (err as Error).message,
      });
    }
  }

  // Build body de transfer-search idéntico al de mi script local (que devuelve HTTP 200).
  const secret = process.env.MERCANTIL_SEARCH_TRANSFER_SECRET_KEY!;
  const clientId = process.env.MERCANTIL_SEARCH_TRANSFER_CLIENT_ID!;
  const baseUrl =
    process.env.MERCANTIL_SEARCH_TRANSFER_BASE_URL || process.env.MERCANTIL_BASE_URL!;
  const person = process.env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || "11269635";
  const url = `${baseUrl.replace(/\/$/, "")}/v1/payment/transfer-search`;

  const body = {
    merchantIdentify: { integratorId: 31, merchantId: person, terminalId: "1" },
    clientIdentify: {
      ipAddress: "127.0.0.1",
      browserAgent: "Chrome 18.1.3",
      mobile: { manufacturer: "Samsung" },
    },
    transferSearchBy: {
      account: encField("01050745651745103031", secret),
      issuerCustomerId: encField("V16006905", secret),
      trxDate: "2026-05-13",
      issuerBankId: 105,
      transactionType: 1,
      paymentReference: "72651965",
      amount: 106.81,
    },
  };
  const bodyStr = JSON.stringify(body);

  const t0 = Date.now();
  let status: number | string = "fetch-error";
  let respText = "";
  let gtid: string | null = null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-IBM-Client-Id": clientId,
      },
      body: bodyStr,
    });
    status = r.status;
    gtid = r.headers.get("x-global-transaction-id");
    respText = await r.text();
  } catch (err) {
    respText = `[fetch err] ${(err as Error).message}`;
  }
  const ms = Date.now() - t0;

  return NextResponse.json({
    ...baseResponse,
    test_transfer: {
      url,
      duration_ms: ms,
      status,
      gtid,
      body_sent: body,
      body_str_len: bodyStr.length,
      response_body: respText.slice(0, 2000),
    },
  });
}
