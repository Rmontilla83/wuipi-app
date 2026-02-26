import { NextRequest, NextResponse } from "next/server";
import { getSalespeople, createSalesperson } from "@/lib/dal/crm-ventas";
import { crmSalespersonSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getSalespeople({
      search: searchParams.get("search") || undefined,
      type: searchParams.get("type") || undefined,
      active_only: searchParams.get("active_only") !== "false",
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validate(crmSalespersonSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const sp = await createSalesperson(validation.data);
    return NextResponse.json(sp, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
