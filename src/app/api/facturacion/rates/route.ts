import { NextRequest, NextResponse } from "next/server";
import { getLatestRate, setExchangeRate } from "@/lib/dal/facturacion";
import { fetchBCVRate } from "@/lib/services/bcv-rate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];
    let rate = await getLatestRate();

    // Auto-fetch from BCV if no rate today
    if (!rate || rate.effective_date !== today) {
      const bcv = await fetchBCVRate();
      if (bcv && bcv.rate > 0) {
        rate = await setExchangeRate({
          from_currency: "USD",
          to_currency: "VES",
          rate: bcv.rate,
          source: bcv.source,
        });
      }
    }

    if (rate) {
      return NextResponse.json({
        rate: rate.rate,
        from_currency: rate.from_currency,
        to_currency: rate.to_currency,
        effective_date: rate.effective_date,
        source: rate.source,
        auto_updated: true,
      });
    }

    return NextResponse.json({ rate: null, message: "No exchange rate available" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Manual rate override
    if (body.rate && body.rate > 0) {
      const result = await setExchangeRate({
        from_currency: body.from_currency || "USD",
        to_currency: body.to_currency || "VES",
        rate: body.rate,
        source: body.source || "manual",
      });
      return NextResponse.json(result);
    }

    // Force refresh from BCV
    if (body.action === "refresh") {
      const bcv = await fetchBCVRate();
      if (bcv && bcv.rate > 0) {
        const result = await setExchangeRate({
          from_currency: "USD",
          to_currency: "VES",
          rate: bcv.rate,
          source: bcv.source,
        });
        return NextResponse.json(result);
      }
      return NextResponse.json({ error: "Could not fetch BCV rate" }, { status: 502 });
    }

    return NextResponse.json({ error: "Provide a rate or action=refresh" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
