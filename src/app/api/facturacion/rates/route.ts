import { NextRequest, NextResponse } from "next/server";
import { getLatestRate, setExchangeRate } from "@/lib/dal/facturacion";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rate = await getLatestRate();
    return NextResponse.json(rate || { rate: null, message: "No exchange rate set" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.rate || body.rate <= 0) {
      return NextResponse.json({ error: "A valid rate is required" }, { status: 400 });
    }

    const result = await setExchangeRate({
      from_currency: body.from_currency || "USD",
      to_currency: body.to_currency || "VES",
      rate: body.rate,
      source: body.source || "manual",
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
