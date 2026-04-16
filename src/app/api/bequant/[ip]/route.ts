// Legacy route — kept for backward compat with existing UI calls.
// Redirects to the full detail endpoint.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { ip: string } }
) {
  const url = new URL(request.url);
  const target = new URL(`/api/bequant/subscribers/${encodeURIComponent(params.ip)}`, url.origin);
  return NextResponse.redirect(target, 308);
}
