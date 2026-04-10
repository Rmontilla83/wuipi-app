import { NextResponse } from "next/server";

export function apiSuccess(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiServerError(error: unknown) {
  // Log full error server-side for debugging (visible in Vercel logs)
  console.error("[API Error]", error);
  // Never expose internal error details to the client
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}
