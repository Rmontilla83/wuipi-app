import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { getCollection, getCollectionDetail, updateCollection, deleteCollection } from "@/lib/dal/crm-cobranzas";
import { crmCollectionUpdateSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const detail = searchParams.get("detail") === "true";
    const collection = detail ? await getCollectionDetail(id) : await getCollection(id);
    return NextResponse.json(collection);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requirePermission("cobranzas", "update");
    if (!caller) return apiError("Sin permisos", 403);

    const { id } = await params;
    const body = await request.json();
    const validation = validate(crmCollectionUpdateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const collection = await updateCollection(id, validation.data);
    return NextResponse.json(collection);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requirePermission("cobranzas", "delete");
    if (!caller) return apiError("Sin permisos", 403);

    const { id } = await params;
    await deleteCollection(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
