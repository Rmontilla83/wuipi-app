// GET /api/audit — List audit log entries (super_admin, admin only)
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("auditoria", "read");
    if (!caller) return apiError("No tienes permiso para ver auditoría", 403);

    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("user_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const sb = createAdminSupabase();
    let query = sb
      .from("audit_log")
      .select("*, profiles!audit_log_user_id_fkey(full_name, email)")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) throw error;

    return apiSuccess({ entries: data || [], limit, offset });
  } catch (error) {
    return apiServerError(error);
  }
}
