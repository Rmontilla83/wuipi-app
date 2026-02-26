import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/dal/crm-ventas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") !== "false";
    const products = await getProducts(activeOnly);
    return NextResponse.json(products);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
