import { NextResponse } from "next/server";
import { isConfigured, sendBriefingToAllChannels, getChannels } from "@/lib/integrations/telegram";
import { gatherBusinessData } from "@/lib/supervisor/gather-data";
import { isCacheRecent } from "@/lib/supervisor/briefing-cache";
import { apiServerError } from "@/lib/api-helpers";
import { requirePermission } from "@/lib/auth/check-permission";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// POST: Send current briefing to Telegram channels (uses cache if recent)
export async function POST(request: Request) {
  try {
    const caller = await requirePermission("supervisor_ia", "read");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

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

    // Try cache for raw data (avoids re-gathering from all sources)
    let rawData: any = {};
    const cached = await isCacheRecent(30);
    if (cached?.raw_data) {
      console.log("[Telegram] Using cached raw data from", cached.generated_at);
      rawData = cached.raw_data;
    } else {
      try { rawData = await gatherBusinessData(); } catch { /* best effort */ }
    }

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
