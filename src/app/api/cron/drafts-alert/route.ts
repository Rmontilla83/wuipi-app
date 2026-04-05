import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isOdooConfigured, searchCount } from "@/lib/integrations/odoo";
import { isConfigured, sendMessage, getChannels } from "@/lib/integrations/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isConfigured() || !isOdooConfigured()) {
      return NextResponse.json({ error: "Telegram or Odoo not configured" }, { status: 503 });
    }

    const supabase = createAdminSupabase();
    const now = new Date();
    const day = now.getDate();

    // Get config: which days to run
    const { data: dayFromConfig } = await supabase
      .from("supervisor_config")
      .select("value")
      .eq("key", "drafts_alert_day_from")
      .single();

    const dayFrom = dayFromConfig ? parseInt(dayFromConfig.value) : 27;

    // Only run on days 27+
    if (day < dayFrom) {
      return NextResponse.json({ ok: true, action: "skip", reason: `Day ${day} < ${dayFrom}` });
    }

    // Get threshold
    const { data: thresholdConfig } = await supabase
      .from("supervisor_config")
      .select("value")
      .eq("key", "drafts_min_count")
      .single();

    const minDrafts = thresholdConfig ? parseInt(thresholdConfig.value) : 50;

    // Count drafts created today in Odoo
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayStr = todayStart.toISOString().split("T")[0];

    const draftCount = await searchCount("account.move", [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "draft"],
      ["create_date", ">=", todayStr],
    ]);

    // Check last alert to avoid duplicates
    const { data: lastAlert } = await supabase
      .from("supervisor_state")
      .select("value, updated_at")
      .eq("key", "last_drafts_alert")
      .single();

    const lastAlertDate = lastAlert?.updated_at ? new Date(lastAlert.updated_at).toDateString() : null;
    const alreadyAlerted = lastAlertDate === now.toDateString();

    if (draftCount < minDrafts || alreadyAlerted) {
      return NextResponse.json({
        ok: true,
        action: "no_alert",
        drafts_today: draftCount,
        threshold: minDrafts,
        already_alerted: alreadyAlerted,
      });
    }

    // Alert! Mass draft creation
    const text = [
      `📄 <b>CREACION MASIVA DE BORRADORES</b>`,
      ``,
      `Se generaron <b>${draftCount} borradores</b> hoy (dia ${day})`,
      ``,
      `Esto indica el inicio del ciclo de facturacion mensual.`,
      `Las cuentas por cobrar aumentaran los proximos dias.`,
      ``,
      `📊 Umbral de alerta: ${minDrafts}+ borradores`,
      ``,
      `🤖 Supervisor IA | ${now.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" })}`,
    ].join("\n");

    const channels = getChannels();
    const sent: string[] = [];
    for (const [name, chatId] of [
      ["socios", channels.socios],
      ["finanzas", channels.finanzas],
    ] as const) {
      if (chatId) {
        const ok = await sendMessage(chatId, text);
        if (ok) sent.push(name);
      }
    }

    // Mark as alerted today
    await supabase.from("supervisor_state").upsert({
      key: "last_drafts_alert",
      value: String(draftCount),
      updated_at: now.toISOString(),
    });

    console.log(`[Drafts Alert] ${draftCount} drafts created today. Sent to: ${sent.join(", ")}`);

    return NextResponse.json({
      ok: true,
      action: "alert_sent",
      drafts_today: draftCount,
      sent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    console.error("[Drafts Alert] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
