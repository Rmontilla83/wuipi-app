import { NextRequest, NextResponse } from "next/server";

/**
 * Enforces Authorization: Bearer <CRON_SECRET> on cron endpoints.
 *
 * Fails closed:
 *   - Missing/empty CRON_SECRET env → 500 (misconfig, stops before leak)
 *   - Missing/mismatched header → 401
 *
 * Returns null when authorized; caller proceeds. Returns NextResponse when
 * rejected; caller must return it immediately.
 *
 * Previous pattern `if (cronSecret && authHeader !== ...)` was a footgun:
 * an empty env var bypassed the check entirely.
 */
export function requireCronAuth(request: NextRequest | Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron-guard] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
