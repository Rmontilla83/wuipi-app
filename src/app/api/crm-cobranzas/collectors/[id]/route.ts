import { NextRequest, NextResponse } from "next/server";
import { updateCollector, deleteCollector } from "@/lib/dal/crm-cobranzas";
import { crmCollectorSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validate(crmCollectorSchema.partial(), body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const collector = await updateCollector(id, validation.data);
    return NextResponse.json(collector);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteCollector(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
