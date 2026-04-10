import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/dal/crm-ventas";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("ventas", "read");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") !== "false";
    const products = await getProducts(activeOnly);
    return NextResponse.json(products);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
