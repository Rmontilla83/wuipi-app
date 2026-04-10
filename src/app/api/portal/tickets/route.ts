import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getPortalCaller } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await getPortalCaller();
    if (!caller) return apiError("No autenticado", 401);

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partner_id");
    if (!partnerId) return apiError("partner_id requerido", 400);

    // Portal user can only see their own tickets
    if (parseInt(partnerId) !== caller.odoo_partner_id) {
      return apiError("Acceso denegado", 403);
    }

    const sb = createAdminSupabase();
    const { data, error } = await sb
      .from("portal_tickets")
      .select("*")
      .eq("odoo_partner_id", parseInt(partnerId))
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return apiSuccess({ tickets: data || [] });
  } catch (error) {
    return apiServerError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getPortalCaller();
    if (!caller) return apiError("No autenticado", 401);

    const body = await request.json();
    const { odoo_partner_id, customer_email, customer_name, subject, description, category } = body;

    if (!odoo_partner_id || !subject) {
      return apiError("Datos incompletos", 400);
    }

    // Portal user can only create tickets for themselves
    if (Number(odoo_partner_id) !== caller.odoo_partner_id) {
      return apiError("Acceso denegado", 403);
    }

    const sb = createAdminSupabase();
    const { data, error } = await sb
      .from("portal_tickets")
      .insert({
        odoo_partner_id,
        customer_email: customer_email || "",
        customer_name: customer_name || "",
        subject,
        description: description || null,
        category: category || "general",
      })
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, 201);
  } catch (error) {
    return apiServerError(error);
  }
}
