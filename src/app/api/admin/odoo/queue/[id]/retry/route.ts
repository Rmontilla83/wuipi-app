// POST /api/admin/odoo/queue/[id]/retry
// Resetea un item de la cola para que el cron lo vuelva a procesar de inmediato.
// Util para items en manual_review tras resolver el problema upstream (Odoo
// volvio, factura corregida manualmente, etc.).

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import { retryQueueItem } from "@/lib/dal/odoo-sync-queue";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await requirePermission("erp", "update");
  if (!caller || (caller.role !== "super_admin" && caller.role !== "admin")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const id = params.id;
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  try {
    await retryQueueItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Error desconocido"
    }, { status: 500 });
  }
}
