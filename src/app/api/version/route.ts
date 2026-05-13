// GET /api/version — endpoint de diagnostico del deploy.
// Devuelve un marker unico y commit info para confirmar inequivocamente
// qué bundle esta sirviendo Vercel en cada deploy.
//
// Publico. Sin auth. No tocar logica de negocio.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const DEPLOY_MARKER = "PAY_CONFIRM_v2026_05_13_DUCKTYPE_2";

export async function GET() {
  return NextResponse.json({
    marker: DEPLOY_MARKER,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    deployment_url: process.env.VERCEL_URL || "unknown",
    region: process.env.VERCEL_REGION || "unknown",
    built_at: new Date().toISOString(),
  });
}
