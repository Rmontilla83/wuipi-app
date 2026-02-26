import { NextRequest, NextResponse } from "next/server";
import { getCollections, createCollection } from "@/lib/dal/crm-cobranzas";
import { crmCollectionCreateSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getCollections({
      search: searchParams.get("search") || undefined,
      stage: searchParams.get("stage") || undefined,
      collector_id: searchParams.get("collector_id") || undefined,
      days_overdue_min: searchParams.get("days_overdue_min") ? parseInt(searchParams.get("days_overdue_min")!) : undefined,
      days_overdue_max: searchParams.get("days_overdue_max") ? parseInt(searchParams.get("days_overdue_max")!) : undefined,
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
    const validation = validate(crmCollectionCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const collection = await createCollection(validation.data);
    return NextResponse.json(collection, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
