import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";
import { getQuotaProgress } from "@/lib/dal/crm-cobranzas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("cobranzas", "read");
    if (!caller) return apiError("Sin permisos", 403);

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
