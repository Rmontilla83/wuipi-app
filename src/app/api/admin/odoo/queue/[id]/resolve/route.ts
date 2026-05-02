// POST /api/admin/odoo/queue/[id]/resolve
// Marca un item como resuelto manualmente (admin lo proceso por fuera, ej.
// registrando el pago directo en Odoo). No vuelve a intentarse automaticamente.
//
// Body: { notes?: string }

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { markQueueItemResolvedManually, cancelQueueItem } from "@/lib/dal/odoo-sync-queue";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await requirePermission("erp", "update");
  if (!caller || (caller.role !== "super_admin" && caller.role !== "admin")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const id = params.id;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  let body: { notes?: string; action?: "resolve" | "cancel" } = {};
  try { body = await request.json(); } catch { /* body opcional */ }

  try {
    if (body.action === "cancel") {
      await cancelQueueItem(id, body.notes);
    } else {
      await markQueueItemResolvedManually(id, {
        user_id: caller.id,
        notes: body.notes,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Error desconocido"
    }, { status: 500 });
  }
}
