import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mercantil/callback
 * Return URL after Mercantil payment — redirects to /pay/[token] page.
 * Mercantil sends the user back here with query params after payment.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    // No token — redirect to home
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wuipi-app.vercel.app";
    return NextResponse.redirect(appUrl);
  }

  // Redirect to the payment status page
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wuipi-app.vercel.app";
  return NextResponse.redirect(`${appUrl}/pay/${token}`);
}
