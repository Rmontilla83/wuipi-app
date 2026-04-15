import { NextRequest, NextResponse } from "next/server";
import { getConversations, createConversation } from "@/lib/dal/inbox";
import { inboxConversationCreateSchema, validate } from "@/lib/validations/schemas";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("ventas", "read");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const result = await getConversations({
      assigned_to: searchParams.get("assigned_to") || undefined,
      status: searchParams.get("status") || undefined,
      channel: searchParams.get("channel") || undefined,
      lead_id: searchParams.get("lead_id") || undefined,
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: Math.min(parseInt(searchParams.get("limit") || "50"), 200),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("ventas", "create");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const body = await request.json();
    const validation = validate(inboxConversationCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const conversation = await createConversation(validation.data);
    return NextResponse.json(conversation, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
