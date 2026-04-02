import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { isOdooConfigured, searchRead } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isOdooConfigured()) {
      return apiError("Sistema no disponible", 503);
    }

    const { email } = await request.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return apiError("Email inválido", 400);
    }

    const partners = await searchRead("res.partner", [
      ["email", "=", email.trim().toLowerCase()],
      ["customer_rank", ">", 0],
    ], {
      fields: ["id", "name", "email"],
      limit: 1,
    });

    if (partners.length === 0) {
      return apiSuccess({ exists: false });
    }

    return apiSuccess({
      exists: true,
      partner_id: partners[0].id,
      name: partners[0].name,
    });
  } catch (error) {
    return apiServerError(error);
  }
}
