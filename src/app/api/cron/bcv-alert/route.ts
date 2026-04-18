import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { fetchBCVRate } from "@/lib/integrations/bcv";
import { isConfigured, sendMessage, getChannels } from "@/lib/integrations/telegram";
import { requireCronAuth } from "@/lib/auth/cron-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const unauth = requireCronAuth(request);
    if (unauth) return unauth;

    if (!isConfigured()) {
      return NextResponse.json({ error: "Telegram not configured" }, { status: 503 });
    }

    const supabase = createAdminSupabase();

    // Check if globally enabled and BCV alert enabled
    const { data: flagRows } = await supabase
      .from("supervisor_config")
      .select("key, value")
      .in("key", ["telegram_enabled", "bcv_alert_enabled"]);

    const flags = new Map((flagRows || []).map((r: any) => [r.key, r.value]));
    if (flags.get("telegram_enabled") === "false") {
      return NextResponse.json({ ok: true, action: "disabled", reason: "Telegram desactivado" });
    }
    if (flags.get("bcv_alert_enabled") === "false") {
      return NextResponse.json({ ok: true, action: "disabled", reason: "Alerta BCV desactivada" });
    }

    // Get current BCV rate
    const bcvRate = await fetchBCVRate();
    if (!bcvRate?.usd_to_bs) {
      return NextResponse.json({ ok: true, action: "no_rate", message: "BCV rate unavailable" });
    }

    const currentRate = bcvRate.usd_to_bs;

    // Get last known rate from state
    const { data: stateRow } = await supabase
      .from("supervisor_state")
      .select("value, updated_at")
      .eq("key", "bcv_rate")
      .single();

    const lastRate = stateRow ? parseFloat(stateRow.value) : null;

    // Get threshold from config
    const { data: configRow } = await supabase
      .from("supervisor_config")
      .select("value")
      .eq("key", "bcv_change_pct")
      .single();

    const threshold = configRow ? parseFloat(configRow.value) : 1;

    // Save current rate to state
    await supabase.from("supervisor_state").upsert({
      key: "bcv_rate",
      value: String(currentRate),
      updated_at: new Date().toISOString(),
    });

    // Compare
    if (!lastRate) {
      return NextResponse.json({ ok: true, action: "first_run", rate: currentRate });
    }

    const changePct = Math.abs(((currentRate - lastRate) / lastRate) * 100);
    const direction = currentRate > lastRate ? "subio" : "bajo";

    if (changePct < threshold) {
      return NextResponse.json({ ok: true, action: "no_change", rate: currentRate, changePct: Math.round(changePct * 100) / 100 });
    }

    // Alert! Rate changed significantly
    const emoji = direction === "subio" ? "📈" : "📉";
    const text = [
      `${emoji} <b>TASA BCV ACTUALIZADA</b>`,
      ``,
      `💱 <b>Bs ${currentRate.toFixed(2)}</b> por 1 USD`,
      ``,
      `Anterior: Bs ${lastRate.toFixed(2)}`,
      `Cambio: ${direction === "subio" ? "+" : "-"}${changePct.toFixed(2)}% (${direction})`,
      ``,
      `🤖 Supervisor IA | ${new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" })}`,
    ].join("\n");

    const channels = getChannels();
    const sent: string[] = [];
    for (const [name, chatId] of [
      ["socios", channels.socios],
      ["finanzas", channels.finanzas],
      ["comercial", channels.comercial],
    ] as const) {
      if (chatId) {
        const ok = await sendMessage(chatId, text);
        if (ok) sent.push(name);
      }
    }

    console.log(`[BCV Alert] Rate changed ${lastRate} → ${currentRate} (${changePct.toFixed(2)}%). Sent to: ${sent.join(", ")}`);

    return NextResponse.json({
      ok: true,
      action: "alert_sent",
      rate: currentRate,
      previous: lastRate,
      changePct: Math.round(changePct * 100) / 100,
      sent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    console.error("[BCV Alert] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
