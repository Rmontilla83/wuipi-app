import { NextRequest, NextResponse } from "next/server";
import { getInvoices, createInvoice } from "@/lib/dal/facturacion";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getInvoices({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      clientId: searchParams.get("client_id") || undefined,
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
    
    if (!body.client_id || !body.items || !body.items.length) {
      return NextResponse.json({ error: "client_id and items are required" }, { status: 400 });
    }

    const { items, ...invoiceData } = body;
    
    // Set default due date if not provided (30 days from issue)
    if (!invoiceData.due_date) {
      const due = new Date();
      due.setDate(due.getDate() + 30);
      invoiceData.due_date = due.toISOString().split("T")[0];
    }
    if (!invoiceData.issue_date) {
      invoiceData.issue_date = new Date().toISOString().split("T")[0];
    }

    const invoice = await createInvoice(invoiceData, items);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
