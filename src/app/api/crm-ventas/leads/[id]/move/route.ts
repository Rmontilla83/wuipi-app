import { NextRequest, NextResponse } from "next/server";
import { moveLead } from "@/lib/dal/crm-ventas";
import { crmLeadMoveSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validation = validate(crmLeadMoveSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const lead = await moveLead(id, validation.data.stage, body.user_name);
    return NextResponse.json(lead);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
