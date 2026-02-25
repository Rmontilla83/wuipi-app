import { NextResponse } from "next/server";
import { getFacturacionStats, getLatestRate } from "@/lib/dal/facturacion";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [stats, rate] = await Promise.all([
      getFacturacionStats(),
      getLatestRate(),
    ]);

    return NextResponse.json({
      ...stats,
      exchange_rate: rate?.rate || null,
      exchange_rate_date: rate?.effective_date || null,
      updated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Facturacion stats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
