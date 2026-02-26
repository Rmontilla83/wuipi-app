import { NextRequest, NextResponse } from "next/server";
import { moveCollection } from "@/lib/dal/crm-cobranzas";
import { crmCollectionMoveSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validate(crmCollectionMoveSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const collection = await moveCollection(id, validation.data.stage, body.user_name);
    return NextResponse.json(collection);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
