export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, getMikrotikNodeDetail } from "@/lib/integrations/odoo";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isOdooConfigured()) return apiError("Odoo no configurado", 503);

    const { id } = await params;
    const nodeId = parseInt(id, 10);
    if (isNaN(nodeId)) return apiError("ID inválido", 400);

    const state = req.nextUrl.searchParams.get("state") || undefined;
    const search = req.nextUrl.searchParams.get("search") || undefined;

    const services = await getMikrotikNodeDetail(nodeId, { state, search });
    return apiSuccess({ services });
  } catch (error) {
    return apiServerError(error);
  }
}
