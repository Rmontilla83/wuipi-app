import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { canManageUsers } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify caller is admin
    const userSb = createServerSupabase();
    const { data: { session } } = await userSb.auth.getSession();
    if (!session?.user) return apiError("No autenticado", 401);

    const sb = createAdminSupabase();
    const { data: caller } = await sb.from("profiles").select("role").eq("id", session.user.id).single();
    if (!caller || !canManageUsers(caller.role)) return apiError("Sin permisos", 403);

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
