export const dynamic = "force-dynamic";

import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";

export async function POST() {
  try {
    const sb = createServerSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return apiError("No autenticado", 401);

    const admin = createAdminSupabase();
    const meta = { ...session.user.app_metadata };
    delete meta.needs_password_setup;

    await admin.auth.admin.updateUserById(session.user.id, {
      app_metadata: meta,
    });

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiServerError(error);
  }
}
