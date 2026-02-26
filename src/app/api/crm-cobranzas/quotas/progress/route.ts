import { NextRequest, NextResponse } from "next/server";
import { getQuotaProgress } from "@/lib/dal/crm-cobranzas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    if (!month) {
      return NextResponse.json({ error: "El parámetro 'month' es requerido" }, { status: 400 });
    }
    const progress = await getQuotaProgress(month);
    return NextResponse.json(progress);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
