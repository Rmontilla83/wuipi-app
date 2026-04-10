import { NextRequest, NextResponse } from "next/server";
import { getInvoice, updateInvoice, deleteInvoice } from "@/lib/dal/facturacion";
import { requirePermission } from "@/lib/auth/check-permission";
import { apiError } from "@/lib/api-helpers";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { id } = await params;
    const invoice = await getInvoice(id);
    return NextResponse.json(invoice);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requirePermission("clientes", "update");
    if (!caller) return apiError("Sin permisos", 403);

    const { id } = await params;
    const body = await request.json();
    const invoice = await updateInvoice(id, body);
    return NextResponse.json(invoice);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requirePermission("clientes", "delete");
    if (!caller) return apiError("Sin permisos", 403);

    const { id } = await params;
    await deleteInvoice(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
