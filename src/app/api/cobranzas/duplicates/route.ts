// POST /api/cobranzas/duplicates — Verifica duplicados antes de crear campaña
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiServerError } from "@/lib/api-helpers";
import { findDuplicateItems } from "@/lib/dal/collection-campaigns";

export async function POST(request: NextRequest) {
  try {
    const { rows } = await request.json();

    const identifiers = (rows || []).map((r: { email?: string; cedula_rif?: string }) => ({
      email: r.email || undefined,
      cedula_rif: r.cedula_rif || undefined,
    }));

    const duplicates = await findDuplicateItems(identifiers);
    return apiSuccess({ duplicates, count: duplicates.length });
  } catch (error) {
    return apiServerError(error);
  }
}
