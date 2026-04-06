import { NextResponse } from "next/server";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { isConfigured, getChannels, sendMessage } from "@/lib/integrations/telegram";
import { apiError, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Config keys we manage
const CONFIG_KEYS = [
  "telegram_enabled",
  "briefing_enabled",
  "bcv_alert_enabled",
  "drafts_alert_enabled",
  "bcv_change_pct",
  "drafts_alert_day_from",
  "drafts_min_count",
] as const;

const DEFAULTS: Record<string, string> = {
  telegram_enabled: "true",
  briefing_enabled: "true",
  bcv_alert_enabled: "true",
  drafts_alert_enabled: "true",
  bcv_change_pct: "1",
  drafts_alert_day_from: "27",
  drafts_min_count: "50",
};

// GET: Read Telegram config + status
export async function GET() {
  try {
    const userSb = await createServerSupabase();
    const { data: { user } } = await userSb.auth.getUser();
    if (!user) return apiError("No autenticado", 401);

    const adminSb = createAdminSupabase();

    // Fetch config values
    const { data: configRows } = await adminSb
      .from("supervisor_config")
      .select("key, value")
      .in("key", [...CONFIG_KEYS]);

    const config: Record<string, string> = { ...DEFAULTS };
    for (const row of configRows || []) {
      config[row.key] = row.value;
    }

    // Fetch last briefing info
    const { data: lastBriefing } = await adminSb
      .from("briefing_history")
      .select("score, engine, telegram_sent, telegram_failed, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Channel status
    const channels = getChannels();

    return NextResponse.json({
      configured: isConfigured(),
      channels: {
        socios: !!channels.socios,
        operaciones: !!channels.operaciones,
        finanzas: !!channels.finanzas,
        comercial: !!channels.comercial,
      },
      config: {
        telegram_enabled: config.telegram_enabled === "true",
        briefing_enabled: config.briefing_enabled === "true",
        bcv_alert_enabled: config.bcv_alert_enabled === "true",
        drafts_alert_enabled: config.drafts_alert_enabled === "true",
        bcv_change_pct: parseFloat(config.bcv_change_pct),
        drafts_alert_day_from: parseInt(config.drafts_alert_day_from),
        drafts_min_count: parseInt(config.drafts_min_count),
      },
      last_briefing: lastBriefing ? {
        score: lastBriefing.score,
        engine: lastBriefing.engine,
        sent: lastBriefing.telegram_sent,
        failed: lastBriefing.telegram_failed,
        date: lastBriefing.created_at,
      } : null,
    });
  } catch (error) {
    return apiServerError(error);
  }
}

// PUT: Update Telegram config
export async function PUT(request: Request) {
  try {
    const userSb = await createServerSupabase();
    const { data: { user } } = await userSb.auth.getUser();
    if (!user) return apiError("No autenticado", 401);

    // Check role — only admin/super_admin
    const role = user.app_metadata?.role;
    if (!role || !["super_admin", "admin"].includes(role)) {
      return apiError("Solo administradores pueden modificar esta configuración", 403);
    }

    const body = await request.json();
    const adminSb = createAdminSupabase();
    const now = new Date().toISOString();

    const upserts: Array<{ key: string; value: string; updated_at: string }> = [];

    for (const key of CONFIG_KEYS) {
      if (body[key] !== undefined) {
        const value = typeof body[key] === "boolean" ? String(body[key]) : String(body[key]);
        upserts.push({ key, value, updated_at: now });
      }
    }

    if (upserts.length > 0) {
      const { error } = await adminSb
        .from("supervisor_config")
        .upsert(upserts, { onConflict: "key" });

      if (error) {
        return apiError(`Error al guardar: ${error.message}`, 500);
      }
    }

    return NextResponse.json({ ok: true, updated: upserts.length });
  } catch (error) {
    return apiServerError(error);
  }
}

// POST: Send test message or trigger manual briefing
export async function POST(request: Request) {
  try {
    const userSb = await createServerSupabase();
    const { data: { user } } = await userSb.auth.getUser();
    if (!user) return apiError("No autenticado", 401);

    const role = user.app_metadata?.role;
    if (!role || !["super_admin", "admin"].includes(role)) {
      return apiError("Solo administradores", 403);
    }

    if (!isConfigured()) {
      return apiError("Telegram no configurado (falta TELEGRAM_BOT_TOKEN)", 503);
    }

    const { action, channel } = await request.json();

    if (action === "test") {
      const channels = getChannels();
      const chatId = channel ? channels[channel as keyof typeof channels] : channels.socios;
      if (!chatId) {
        return apiError(`Canal "${channel || "socios"}" no configurado`, 400);
      }

      const text = [
        `🔔 <b>Test de conexión</b>`,
        ``,
        `Mensaje de prueba enviado desde el panel de configuración.`,
        `Usuario: ${user.email}`,
        ``,
        `🤖 Supervisor IA | ${new Date().toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" })}`,
      ].join("\n");

      const ok = await sendMessage(chatId, text);
      return NextResponse.json({ ok, channel: channel || "socios" });
    }

    return apiError("Acción no reconocida", 400);
  } catch (error) {
    return apiServerError(error);
  }
}
