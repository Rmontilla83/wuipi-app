import { NextResponse } from "next/server";

export function apiSuccess(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function apiServerError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error interno del servidor";
  console.error("[API Error]", error);
  return NextResponse.json({ error: message }, { status: 500 });
}
