import { NextRequest, NextResponse } from "next/server";
import { getContacts, createContact } from "@/lib/dal/inbox";
import { inboxContactCreateSchema, validate } from "@/lib/validations/schemas";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("ventas", "read");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const result = await getContacts({
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
    const validation = validate(inboxContactCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const contact = await createContact(validation.data);
    return NextResponse.json(contact, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
