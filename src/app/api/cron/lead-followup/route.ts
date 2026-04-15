// ===========================================
// CRON: Lead Follow-up & Dormant Management
// Runs daily — handles follow-ups, dormant marking, and auto-close
// ===========================================
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { createMessage } from "@/lib/dal/inbox";

const FOLLOWUP_1_HOURS = 24;
const FOLLOWUP_2_HOURS = 48;
const DORMANT_DAYS = 7;
const CLOSE_DAYS = 30;

const FOLLOWUP_MESSAGES = [
  "Hola! 😊 Queríamos saber si pudimos ayudarte con tu consulta de internet. Si tienes alguna duda, aquí estamos para ayudarte.",
  "Hola de nuevo! Solo queríamos recordarte que estamos aquí si necesitas internet. ¿Te gustaría que te contacte un asesor directamente?",
];

export async function GET() {
  const sb = createAdminSupabase();
  const now = new Date();
  const stats = {
    followup_1_sent: 0,
    followup_2_sent: 0,
    marked_dormant: 0,
    auto_closed: 0,
    errors: [] as string[],
  };

  try {
    // ============================================
    // 1. FOLLOW-UPS (24h and 48h)
    // ============================================
    // Find conversations where:
    // - Last message was outbound (bot or agent spoke last)
    // - Not on hold (on_hold_reason IS NULL)
    // - Bot or active status (not already waiting/resolved/expired)
    // - followup_count < 2

    const { data: conversations } = await sb
      .from("inbox_conversations")
      .select("id, last_message_at, followup_count, status, lead_id, on_hold_reason")
      .in("status", ["bot", "active", "waiting"])
      .is("on_hold_reason", null)
      .lt("followup_count", 2)
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: true });

    for (const conv of conversations || []) {
      try {
        const lastMsgAt = new Date(conv.last_message_at);
        const hoursSince = (now.getTime() - lastMsgAt.getTime()) / (1000 * 60 * 60);

        // Check if last message was outbound (bot/agent spoke last, client hasn't replied)
        const { data: lastMsg } = await sb
          .from("inbox_messages")
          .select("direction")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastMsg || lastMsg.direction !== "outbound") continue;

        // Determine which follow-up to send
        if (conv.followup_count === 0 && hoursSince >= FOLLOWUP_1_HOURS && hoursSince < FOLLOWUP_2_HOURS * 2) {
          await createMessage({
            conversation_id: conv.id,
            direction: "outbound",
            sender_type: "bot",
            content: FOLLOWUP_MESSAGES[0],
            status: "simulated",
            metadata: { type: "followup", followup_number: 1 },
          });
          await sb.from("inbox_conversations").update({
            followup_count: 1,
            last_followup_at: now.toISOString(),
          }).eq("id", conv.id);
          stats.followup_1_sent++;
        } else if (conv.followup_count === 1 && hoursSince >= FOLLOWUP_2_HOURS) {
          await createMessage({
            conversation_id: conv.id,
            direction: "outbound",
            sender_type: "bot",
            content: FOLLOWUP_MESSAGES[1],
            status: "simulated",
            metadata: { type: "followup", followup_number: 2 },
          });
          await sb.from("inbox_conversations").update({
            followup_count: 2,
            last_followup_at: now.toISOString(),
          }).eq("id", conv.id);
          stats.followup_2_sent++;
        }
      } catch (err: any) {
        stats.errors.push(`followup ${conv.id}: ${err.message}`);
      }
    }

    // ============================================
    // 2. MARK DORMANT (7 days without response)
    // ============================================
    const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Find conversations with 2 followups done, last message > 7 days ago, not on hold
    const { data: dormantCandidates } = await sb
      .from("inbox_conversations")
      .select("id, lead_id")
      .in("status", ["bot", "active", "waiting"])
      .is("on_hold_reason", null)
      .gte("followup_count", 2)
      .lt("last_message_at", dormantCutoff);

    for (const conv of dormantCandidates || []) {
      try {
        // Mark conversation
        await sb.from("inbox_conversations").update({
          status: "expired",
          bot_active: false,
        }).eq("id", conv.id);

        // Mark lead as dormant
        if (conv.lead_id) {
          await sb.from("crm_leads").update({
            is_dormant: true,
          }).eq("id", conv.lead_id);
        }

        // System message
        await createMessage({
          conversation_id: conv.id,
          direction: "outbound",
          sender_type: "system",
          content: "Conversación marcada como inactiva por falta de respuesta. Si el cliente vuelve a escribir, se reactivará automáticamente.",
          content_type: "system",
          status: "simulated",
        });

        stats.marked_dormant++;
      } catch (err: any) {
        stats.errors.push(`dormant ${conv.id}: ${err.message}`);
      }
    }

    // ============================================
    // 3. AUTO-CLOSE (30 days, only early-stage leads)
    // ============================================
    const closeCutoff = new Date(now.getTime() - CLOSE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: closeCandidates } = await sb
      .from("crm_leads")
      .select("id, stage")
      .eq("is_dormant", true)
      .eq("is_deleted", false)
      .in("stage", ["incoming", "calificacion"])
      .lt("stage_changed_at", closeCutoff);

    for (const lead of closeCandidates || []) {
      try {
        await sb.from("crm_leads").update({
          stage: "no_concretado",
          lost_at: now.toISOString(),
          stage_changed_at: now.toISOString(),
        }).eq("id", lead.id);
        stats.auto_closed++;
      } catch (err: any) {
        stats.errors.push(`close ${lead.id}: ${err.message}`);
      }
    }

    // ============================================
    // 4. EXPIRED ON-HOLD ALERTS
    // ============================================
    // Find on-hold conversations past their deadline
    const { data: expiredHolds } = await sb
      .from("inbox_conversations")
      .select("id")
      .not("on_hold_reason", "is", null)
      .lt("on_hold_until", now.toISOString());

    // Clear on_hold so they re-enter the normal lifecycle
    for (const conv of expiredHolds || []) {
      await sb.from("inbox_conversations").update({
        on_hold_reason: null,
        on_hold_until: null,
        on_hold_by: null,
      }).eq("id", conv.id);
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      stats: {
        ...stats,
        expired_holds_cleared: expiredHolds?.length || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
