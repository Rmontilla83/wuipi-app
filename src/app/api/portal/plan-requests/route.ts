import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { odoo_partner_id, customer_email, customer_name, subscription_name, current_plan, requested_plan, notes } = body;

    if (!odoo_partner_id || !current_plan || !requested_plan) {
      return apiError("Datos incompletos", 400);
    }

    const sb = createAdminSupabase();
    const { data, error } = await sb
      .from("portal_plan_requests")
      .insert({
        odoo_partner_id,
        customer_email: customer_email || "",
        customer_name: customer_name || "",
        subscription_name: subscription_name || null,
        current_plan,
        requested_plan,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return apiSuccess(data, 201);
  } catch (error) {
    return apiServerError(error);
  }
}
