import { NextRequest, NextResponse } from "next/server";
import { markConversationRead } from "@/lib/dal/inbox";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const caller = await requirePermission("ventas", "update");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    await markConversationRead(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
