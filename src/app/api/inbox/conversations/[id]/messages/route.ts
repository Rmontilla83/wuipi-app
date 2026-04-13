import { NextRequest, NextResponse } from "next/server";
import { getMessages, createMessage } from "@/lib/dal/inbox";
import { inboxMessageCreateSchema, validate } from "@/lib/validations/schemas";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requirePermission("ventas", "read");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const messages = await getMessages(id, {
      before: searchParams.get("before") || undefined,
      limit: Math.min(parseInt(searchParams.get("limit") || "50"), 200),
    });
    return NextResponse.json({ data: messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requirePermission("ventas", "create");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const validation = validate(inboxMessageCreateSchema, {
      ...body,
      conversation_id: id,
      direction: "outbound",
      sender_type: "agent",
    });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const message = await createMessage({
      conversation_id: id,
      direction: "outbound",
      sender_type: "agent",
      content: validation.data.content,
      content_type: validation.data.content_type,
      status: "simulated",
    });
    return NextResponse.json(message, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
