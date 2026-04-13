import { NextRequest, NextResponse } from "next/server";
import { getConversation, updateConversation } from "@/lib/dal/inbox";
import { inboxConversationUpdateSchema, validate } from "@/lib/validations/schemas";
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
    const conversation = await getConversation(id);
    if (!conversation) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    return NextResponse.json(conversation);
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
    const validation = validate(inboxConversationUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const updated = await updateConversation(id, validation.data);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
