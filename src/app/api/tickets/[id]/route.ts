import { NextRequest, NextResponse } from "next/server";
import { getTicket, getTicketWithComments, updateTicket, deleteTicket, addTicketComment } from "@/lib/dal/tickets";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const withComments = searchParams.get("comments") === "true";
    
    const ticket = withComments ? await getTicketWithComments(id) : await getTicket(id);
    return NextResponse.json(ticket);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Track status changes as comments
    if (body._track_change && body._old_status && body.status && body._old_status !== body.status) {
      await addTicketComment({
        ticket_id: id,
        author_id: body._author_id || undefined,
        content: `Estado cambiado de "${body._old_status}" a "${body.status}"`,
        is_internal: true,
        comment_type: "status_change",
        old_value: body._old_status,
        new_value: body.status,
      });
    }
    
    // Track assignment changes
    if (body._track_change && body._old_assigned !== undefined && body.assigned_to && body._old_assigned !== body.assigned_to) {
      await addTicketComment({
        ticket_id: id,
        author_id: body._author_id || undefined,
        content: `Ticket reasignado`,
        is_internal: true,
        comment_type: "assignment",
        new_value: body.assigned_to,
      });
    }
    
    // Remove tracking fields before update
    const { _track_change, _old_status, _old_assigned, _author_id, ...updates } = body;
    
    const ticket = await updateTicket(id, updates);
    return NextResponse.json(ticket);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTicket(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
