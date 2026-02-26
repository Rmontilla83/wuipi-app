import { NextRequest, NextResponse } from "next/server";
import { getQuotas, upsertQuota } from "@/lib/dal/crm-cobranzas";
import { crmCollectionQuotaSchema, validate } from "@/lib/validations/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    if (!month) {
      return NextResponse.json({ error: "El parámetro 'month' es requerido" }, { status: 400 });
    }
    const quotas = await getQuotas(month);
    return NextResponse.json(quotas);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validate(crmCollectionQuotaSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }
    const quota = await upsertQuota(validation.data);
    return NextResponse.json(quota, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
