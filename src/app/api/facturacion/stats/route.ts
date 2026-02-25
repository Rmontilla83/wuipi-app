import { NextResponse } from "next/server";
import { getFacturacionStats, getLatestRate, setExchangeRate } from "@/lib/dal/facturacion";
import { fetchBCVRate } from "@/lib/services/bcv-rate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch stats and rate in parallel
    const [stats, existingRate] = await Promise.all([
      getFacturacionStats(),
      getLatestRate(),
    ]);

    // Auto-fetch BCV rate if none today
    let rate = existingRate;
    const today = new Date().toISOString().split("T")[0];
    if (!rate || rate.effective_date !== today) {
      try {
        const bcv = await fetchBCVRate();
        if (bcv && bcv.rate > 0) {
          rate = await setExchangeRate({
            from_currency: "USD",
            to_currency: "VES",
            rate: bcv.rate,
            source: bcv.source,
          });
        }
      } catch {
        // Keep existing rate if fetch fails
      }
    }

    return NextResponse.json({
      ...stats,
      exchange_rate: rate?.rate || null,
      exchange_rate_date: rate?.effective_date || null,
      exchange_rate_source: rate?.source || null,
      updated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Facturacion stats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
