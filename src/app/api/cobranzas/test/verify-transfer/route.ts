// POST /api/cobranzas/test/verify-transfer
// Endpoint de diagnostico para Mercantil — Busqueda de Transferencias.
// Hace la llamada REAL al API de Mercantil con los 3 fixes aplicados
// (2026-05-05) y devuelve el response completo (sin cifrar) para
// diagnostico junto con el cuerpo exacto que se envio.
//
// Solo admin (cobranzas:update). NO loguea valores sensibles en plano:
// `account` y `issuerCustomerId` se devuelven cifrados (igual que viajan
// al banco) + un campo `*_masked` para humanos.
//
// Body:
//   {
//     account: string,              // numero de cuenta destino (sin cifrar al endpoint, se cifra antes de mandar)
//     issuerCustomerId: string,     // RIF/cedula del emisor (V12345678 etc)
//     trxDate: string,              // YYYY-MM-DD
//     paymentReference: string,     // referencia bancaria completa (se trunca automaticamente a ultimos 8)
//     amount: number,               // monto exacto
//     issuerBankId: number,         // codigo del banco emisor (102 BdV, 134 Banesco, etc)
//     transactionType?: number,     // default 1
//   }
//
// Devuelve:
//   - ok=true: { input, applied_fixes, request, response }
//   - ok=false: { input, applied_fixes, request, error }

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import {
  configFromEnv,
  resolveConfig,
  getProductCredentials,
  encryptField,
  transferReferenceLast8,
  normalizeIssuerCustomerId,
} from "@/lib/mercantil";
import { buildTransferSearchMerchantIdentify } from "@/lib/mercantil/methods/search";
import { apiRequest, MercantilApiError } from "@/lib/mercantil/core/http";

interface VerifyBody {
  account?: string;
  issuerCustomerId?: string;
  trxDate?: string;
  paymentReference?: string;
  amount?: number;
  issuerBankId?: number;
  transactionType?: number;
}

function maskTail(value: string, tail = 4): string {
  if (!value) return "";
  if (value.length <= tail) return "*".repeat(value.length);
  return "*".repeat(value.length - tail) + value.slice(-tail);
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "update");
    if (!caller) return apiError("Sin permisos", 403);

    const body: VerifyBody = await request.json();

    // Validacion estricta
    if (!body.account) return apiError("Falta `account` (numero de cuenta destino)", 400);
    if (!body.issuerCustomerId) return apiError("Falta `issuerCustomerId` (RIF/cedula emisor)", 400);
    if (!body.trxDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.trxDate)) {
      return apiError("`trxDate` invalido — formato YYYY-MM-DD", 400);
    }
    if (!body.paymentReference) return apiError("Falta `paymentReference`", 400);
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return apiError("`amount` invalido (debe ser numero > 0)", 400);
    }
    if (typeof body.issuerBankId !== "number") {
      return apiError("`issuerBankId` invalido (debe ser numero, p.ej. 102)", 400);
    }

    const transactionType = typeof body.transactionType === "number" ? body.transactionType : 1;

    // Cargar SDK config + credenciales
    const config = configFromEnv();
    const resolved = resolveConfig(config);
    if (!resolved.configuredProducts.has("transfer_search")) {
      return apiError(
        "Producto transfer_search no configurado. Verifica MERCANTIL_SEARCH_TRANSFER_* en Vercel.",
        500
      );
    }
    const creds = getProductCredentials(config, "transfer_search");
    const url = creds.baseUrl
      ? `${creds.baseUrl.replace(/\/$/, "")}/v1/payment/transfer-search`
      : resolved.endpoints.searchTransfersUrl;

    // Aplicar los 4 fixes (2026-05-05 + 2026-05-13)
    const merchantIdentify = buildTransferSearchMerchantIdentify(config, creds.merchantId);
    const truncatedReference = transferReferenceLast8(body.paymentReference);
    const normalizedIssuerCustomerId = normalizeIssuerCustomerId(body.issuerCustomerId);
    const encryptedAccount = encryptField(body.account, creds.secretKey);
    const encryptedIssuerCustomerId = encryptField(normalizedIssuerCustomerId, creds.secretKey);

    const requestBody = {
      merchantIdentify,
      clientIdentify: {
        ipAddress: "127.0.0.1",
        browserAgent: "Mozilla/5.0 (WUIPI verify-transfer test)",
        mobile: { manufacturer: "Samsung" },
      },
      transferSearchBy: {
        account: encryptedAccount,
        issuerCustomerId: encryptedIssuerCustomerId,
        trxDate: body.trxDate,
        issuerBankId: body.issuerBankId,
        transactionType,
        paymentReference: truncatedReference,
        amount: body.amount,
      },
    };

    const appliedFixes = {
      fix_1_merchantId: {
        env_var: "MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER",
        value_used: merchantIdentify.merchantId,
        product_default_217546_overridden: merchantIdentify.merchantId !== creds.merchantId,
      },
      fix_2_paymentReference: {
        input: body.paymentReference,
        truncated_last_8: truncatedReference,
      },
      fix_3_clientIdentify_mobile: {
        added: true,
        value: { manufacturer: "Samsung" },
        reason: "Mercantil 2026-05-13: sin subnodo mobile el API responde 9999 por estructura",
      },
      fix_4_issuerCustomerId_format: {
        input: body.issuerCustomerId,
        normalized: normalizedIssuerCustomerId,
        reason: "Mercantil 2026-05-13: formato compacto V17123456 (sin guiones/puntos)",
      },
      encryption: {
        algorithm: "AES-128/ECB/PKCS5Padding",
        secret_key_tail: maskTail(creds.secretKey, 6),
        account_masked: maskTail(body.account, 4),
        issuerCustomerId_masked: normalizedIssuerCustomerId,
      },
      endpoint: url,
      client_id: creds.clientId,
    };

    const requestSummary = {
      url,
      body: requestBody,
    };

    // Llamar a Mercantil
    try {
      const resp = await apiRequest<Record<string, unknown>>({
        method: "POST",
        url,
        clientId: creds.clientId,
        body: requestBody as Record<string, unknown>,
        retries: 0, // diagnostico — no queremos reintentos que oculten el primer error
      });
      return apiSuccess({
        ok: true,
        input: { ...body, transactionType },
        applied_fixes: appliedFixes,
        request: requestSummary,
        response: {
          status: resp.status,
          data: resp.data,
          x_global_transaction_id: resp.headers["x-global-transaction-id"] || null,
          x_request_id: resp.requestId || null,
        },
      });
    } catch (err) {
      if (err instanceof MercantilApiError) {
        return apiSuccess({
          ok: false,
          input: { ...body, transactionType },
          applied_fixes: appliedFixes,
          request: requestSummary,
          error: {
            status: err.status,
            code: err.code,
            message: err.message,
            details: err.details,
          },
        });
      }
      throw err;
    }
  } catch (err) {
    return apiServerError(err);
  }
}

// GET — info de uso para el equipo (sin tocar Mercantil)
export async function GET() {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const config = configFromEnv();
    const resolved = resolveConfig(config);
    const configured = resolved.configuredProducts.has("transfer_search");
    const creds = configured ? getProductCredentials(config, "transfer_search") : null;
    const personNumber = process.env.MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER || null;

    return apiSuccess({
      ok: true,
      product_configured: configured,
      person_number_env: personNumber,
      product_default_merchant_id: creds?.merchantId ?? null,
      will_use_merchant_id: personNumber || creds?.merchantId || null,
      endpoint: creds
        ? creds.baseUrl
          ? `${creds.baseUrl.replace(/\/$/, "")}/v1/payment/transfer-search`
          : resolved.endpoints.searchTransfersUrl
        : null,
      client_id_tail: creds ? maskTail(creds.clientId, 6) : null,
      secret_key_tail: creds ? maskTail(creds.secretKey, 6) : null,
      sample_body: {
        account: "01050xxx...numero_cuenta_wuipi",
        issuerCustomerId: "V12345678",
        trxDate: "2026-05-04",
        paymentReference: "0025583242567",
        amount: 100.5,
        issuerBankId: 102,
        transactionType: 1,
      },
      notas: [
        "merchantId se override automaticamente con MERCANTIL_TRANSFER_SEARCH_PERSON_NUMBER (11269635 para Wuipi)",
        "paymentReference se trunca a los ultimos 8 digitos antes de mandar",
        "clientIdentify incluye subnodo mobile.manufacturer obligatorio (fix Mercantil 2026-05-13)",
        "issuerCustomerId se normaliza a formato compacto V17123456 antes de cifrar (fix Mercantil 2026-05-13)",
        "account y issuerCustomerId se cifran con AES-128/ECB usando la Clave B (productos 6-9)",
      ],
    });
  } catch (err) {
    return apiServerError(err);
  }
}
