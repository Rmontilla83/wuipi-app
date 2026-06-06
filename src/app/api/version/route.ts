// GET /api/version — endpoint de diagnostico del deploy.
// Devuelve un marker unico y commit info para confirmar inequivocamente
// qué bundle esta sirviendo Vercel en cada deploy.
//
// Publico, pero NO expone configuracion sensible ni ejecuta operaciones.
// (Historico: tenia modos `?test-transfer` y volcaba fingerprints de las
// claves Mercantil / whitelist Odoo — removido por seguridad 2026-06-05.
// Para diagnostico de pasarela usar un endpoint protegido por permiso.)

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const DEPLOY_MARKER = "PAY_CONFIRM_v2026_05_13_DUCKTYPE_2";

export async function GET() {
  return NextResponse.json({
    marker: DEPLOY_MARKER,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    region: process.env.VERCEL_REGION || "unknown",
    built_at: new Date().toISOString(),
  });
}
