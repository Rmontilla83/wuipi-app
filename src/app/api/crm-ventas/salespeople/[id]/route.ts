import { NextRequest, NextResponse } from "next/server";
import { updateSalesperson, deleteSalesperson } from "@/lib/dal/crm-ventas";
import { crmSalespersonSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validate(crmSalespersonSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const sp = await updateSalesperson(id, validation.data);
    return NextResponse.json(sp);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteSalesperson(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
