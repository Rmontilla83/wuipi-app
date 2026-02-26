import { NextRequest, NextResponse } from "next/server";
import { getLeads, createLead } from "@/lib/dal/crm-ventas";
import { crmLeadCreateSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getLeads({
      search: searchParams.get("search") || undefined,
      stage: searchParams.get("stage") || undefined,
      salesperson_id: searchParams.get("salesperson_id") || undefined,
      product_id: searchParams.get("product_id") || undefined,
      source: searchParams.get("source") || undefined,
      date_from: searchParams.get("date_from") || undefined,
      date_to: searchParams.get("date_to") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: Math.min(parseInt(searchParams.get("limit") || "200"), 500),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validate(crmLeadCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const lead = await createLead(validation.data);
    return NextResponse.json(lead, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
