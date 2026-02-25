import { NextRequest, NextResponse } from "next/server";
import { getPayments, createPayment, updatePayment } from "@/lib/dal/facturacion";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getPayments({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      clientId: searchParams.get("client_id") || undefined,
      invoiceId: searchParams.get("invoice_id") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "50"),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.client_id || !body.amount || !body.payment_method_id) {
      return NextResponse.json({ error: "client_id, amount and payment_method_id are required" }, { status: 400 });
    }

    if (!body.payment_date) {
      body.payment_date = new Date().toISOString().split("T")[0];
    }

    const payment = await createPayment(body);
    return NextResponse.json(payment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { id, ...updates } = body;
    const payment = await updatePayment(id, updates);
    return NextResponse.json(payment);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
