import { NextRequest, NextResponse } from "next/server";
import { getClients, createClient } from "@/lib/dal/facturacion";
import { clientCreateSchema, validate } from "@/lib/validations/schemas";
import { requirePermission } from "@/lib/auth/check-permission";
import { apiError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const caller = await requirePermission("clientes", "read");
    if (!caller) return apiError("Sin permisos", 403);

    const { searchParams } = new URL(request.url);
    const result = await getClients({
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      nodo: searchParams.get("nodo") || undefined,
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
    const caller = await requirePermission("clientes", "create");
    if (!caller) return apiError("Sin permisos", 403);

    const body = await request.json();
    
    const validation = validate(clientCreateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }

    const client = await createClient(validation.data);
    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
