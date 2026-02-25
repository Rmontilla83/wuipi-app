import { NextRequest, NextResponse } from "next/server";
import { addTicketComment } from "@/lib/dal/tickets";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "El comentario no puede estar vacío" }, { status: 400 });
    }

    const comment = await addTicketComment({
      ticket_id: id,
      author_id: body.author_id || undefined,
      content: body.content,
      is_internal: body.is_internal || false,
      comment_type: body.comment_type || "comment",
    });
    
    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
