// GET /api/admin/odoo/queue?status=...&limit=...&offset=...
// Lista items de la cola odoo_sync_queue. Para la UI admin.

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { listQueueItems, type OdooSyncQueueStatus } from "@/lib/dal/odoo-sync-queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const caller = await requirePermission("erp", "read");
  if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
  const offset = Number(url.searchParams.get("offset") || "0");

  const validStatuses: OdooSyncQueueStatus[] = ["pending", "retrying", "manual_review", "done", "cancelled"];
  const statusFilter = statusParam
    ? statusParam.split(",").filter((s): s is OdooSyncQueueStatus => validStatuses.includes(s as OdooSyncQueueStatus))
    : undefined;

  const { items, total } = await listQueueItems({ status: statusFilter, limit, offset });
  return NextResponse.json({ items, total, limit, offset });
}
