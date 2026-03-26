// ============================================================
// Audit logging — records important actions
// ============================================================

import { createAdminSupabase } from "@/lib/supabase/server";

export async function logAudit(params: {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    const sb = createAdminSupabase();
    await sb.from("audit_log").insert({
      user_id: params.userId,
      action: params.action,
      resource: params.resource,
      resource_id: params.resourceId || null,
      details: params.details || {},
      ip_address: params.ipAddress || null,
    });
  } catch (err) {
    // Don't throw — audit logging should never break the main flow
    console.error("[Audit] Error logging action:", err);
  }
}
