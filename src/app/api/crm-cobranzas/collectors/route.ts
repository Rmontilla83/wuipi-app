import { NextRequest, NextResponse } from "next/server";
import { getCollectors, createCollector } from "@/lib/dal/crm-cobranzas";
import { crmCollectorSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getCollectors({
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
    const validation = validate(crmCollectorSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const collector = await createCollector(validation.data);
    return NextResponse.json(collector, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
