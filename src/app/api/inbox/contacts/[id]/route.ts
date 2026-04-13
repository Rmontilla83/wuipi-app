import { NextRequest, NextResponse } from "next/server";
import { getContact, updateContact } from "@/lib/dal/inbox";
import { inboxContactUpdateSchema, validate } from "@/lib/validations/schemas";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requirePermission("ventas", "read");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    const contact = await getContact(id);
    if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    return NextResponse.json(contact);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requirePermission("ventas", "update");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const validation = validate(inboxContactUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const updated = await updateContact(id, validation.data);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
