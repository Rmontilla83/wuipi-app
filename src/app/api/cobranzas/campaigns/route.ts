// GET /api/cobranzas/campaigns — Lista campañas
// POST /api/cobranzas/campaigns — Crear campaña vacía (draft)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { validate, collectionCampaignCreateSchema } from "@/lib/validations/schemas";
import { getCampaigns, createCampaign, getCampaign, getItemsByCampaign } from "@/lib/dal/collection-campaigns";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");

    if (id) {
      const campaign = await getCampaign(id);
      if (!campaign) return apiError("Campaña no encontrada", 404);
      const items = await getItemsByCampaign(id, {
        status: searchParams.get("status") || undefined,
        search: searchParams.get("search") || undefined,
      });
      return apiSuccess({ campaign, items });
    }

    const campaigns = await getCampaigns();
    return apiSuccess({ campaigns });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validate(collectionCampaignCreateSchema, body);
    if (!parsed.success) return apiError(parsed.error, 400);

    const campaign = await createCampaign({
      name: parsed.data.name,
      description: parsed.data.description || undefined,
    });
    return apiSuccess({ campaign }, 201);
  } catch (error) {
    return apiServerError(error);
  }
}
