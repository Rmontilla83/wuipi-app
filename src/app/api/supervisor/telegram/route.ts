import { NextResponse } from "next/server";
import { isConfigured, sendBriefingToAllChannels, getChannels } from "@/lib/integrations/telegram";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";
import { apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST: Send current briefing to Telegram channels (gathers raw data for detailed formatting)
export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "Telegram no configurado. Agregar TELEGRAM_BOT_TOKEN." },
        { status: 503 }
      );
    }

    const { briefing } = await request.json();
    if (!briefing) {
      return NextResponse.json({ error: "Briefing data required" }, { status: 400 });
    }

    // Gather raw data for detailed Operaciones channel
    let rawData: any = {};
    try { rawData = await gatherBusinessData(); } catch { /* best effort */ }

    const { sent, failed } = await sendBriefingToAllChannels(briefing, rawData);

    return NextResponse.json({ ok: true, sent, failed });
  } catch (error) {
    return apiServerError(error);
  }
}

// GET: Check Telegram configuration status
export async function GET() {
  const channels = getChannels();
  return NextResponse.json({
    configured: isConfigured(),
    channels: {
      socios: !!channels.socios,
      operaciones: !!channels.operaciones,
      finanzas: !!channels.finanzas,
      comercial: !!channels.comercial,
    },
  });
}
