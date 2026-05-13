// GET /api/version — endpoint de diagnostico del deploy.
// Devuelve un marker unico y commit info para confirmar inequivocamente
// qué bundle esta sirviendo Vercel en cada deploy.
//
// Publico. Sin auth. No tocar logica de negocio.

export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

const DEPLOY_MARKER = "PAY_CONFIRM_v2026_05_13_DUCKTYPE_2";

function fingerprint(value: string | undefined): { len: number; tail6: string; sha256_first16: string } {
  if (!value) return { len: 0, tail6: "", sha256_first16: "" };
  return {
    len: value.length,
    tail6: value.slice(-6),
    sha256_first16: crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16),
  };
}

export async function GET() {
  console.log(`[/api/version] hit | marker=${DEPLOY_MARKER}`);
  return NextResponse.json({
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
  });
}
