import { NextResponse } from "next/server";

export async function GET() {
  const gemini = !!process.env.GEMINI_API_KEY;
  const claude = !!process.env.ANTHROPIC_API_KEY;
  const odoo = !!(process.env.ODOO_URL && process.env.ODOO_API_KEY);
  const zabbix = !!(process.env.ZABBIX_URL && process.env.ZABBIX_AUTH_TOKEN);

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
    services: {
      gemini,
      claude,
      ai: gemini || claude,
      odoo,
      zabbix,
    },
  });
}
