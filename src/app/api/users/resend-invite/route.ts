import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("usuarios", "create");
    if (!caller) return apiError("Sin permisos", 403);

    const sb = createAdminSupabase();

    const { email } = await request.json();
    if (!email) return apiError("Email requerido", 400);

    // Resend invitation
    const { error } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://api.wuipi.net/api/auth/callback",
    });

    if (error) {
      if (error.message?.includes("already confirmed")) {
        return apiError("Este usuario ya confirmo su cuenta", 400);
      }
      throw error;
    }

    return apiSuccess({ sent: true });
  } catch (error) {
    return apiServerError(error);
  }
}
