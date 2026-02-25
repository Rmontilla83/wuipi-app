import { NextRequest, NextResponse } from "next/server";
import { getTickets, createTicket, getTicketCategories, getTechnicians } from "@/lib/dal/tickets";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Special endpoints
    const type = searchParams.get("type");
    if (type === "categories") {
      const categories = await getTicketCategories();
      return NextResponse.json(categories);
    }
    if (type === "technicians") {
      const techs = await getTechnicians();
      return NextResponse.json(techs);
    }

    const result = await getTickets({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      priority: searchParams.get("priority") || undefined,
      category_id: searchParams.get("category_id") || undefined,
      assigned_to: searchParams.get("assigned_to") || undefined,
      client_id: searchParams.get("client_id") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: Math.min(parseInt(searchParams.get("limit") || "50"), 100),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.subject?.trim()) {
      return NextResponse.json({ error: "El asunto es obligatorio" }, { status: 400 });
    }

    const ticket = await createTicket(body);
    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
