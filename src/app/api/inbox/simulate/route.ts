import { NextRequest, NextResponse } from "next/server";
import {
  findContactByChannel,
  createContact,
  getOrCreateConversation,
  createMessage,
  getConversation,
} from "@/lib/dal/inbox";
import { inboxSimulateInboundSchema, validate } from "@/lib/validations/schemas";
import { requirePermission } from "@/lib/auth/check-permission";
import { handleInboxMessage } from "@/lib/bot/sales-engine";
import type { InboxChannel } from "@/types/inbox";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const caller = await requirePermission("ventas", "create");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const body = await request.json();
    const validation = validate(inboxSimulateInboundSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 });
    }

    const { contact_name, phone, channel, message, lead_id } = validation.data;

    // 1. Find or create contact
    const channelId = phone || contact_name;
    let contact = await findContactByChannel(channel as InboxChannel, channelId);

    if (!contact) {
      const contactData: Record<string, string | null> = {
        display_name: contact_name,
        phone: phone || null,
      };
      // Set the appropriate channel ID
      if (channel === "whatsapp" && phone) contactData.wa_id = phone;
      if (channel === "instagram") contactData.ig_id = channelId;
      if (channel === "facebook") contactData.fb_id = channelId;

      contact = await createContact(contactData as any);
    }

    // 2. Get or create conversation
    const conversation = await getOrCreateConversation(
      contact.id,
      channel as InboxChannel,
      lead_id || null
    );

    // 3. Create inbound message
    const msg = await createMessage({
      conversation_id: conversation.id,
      direction: "inbound",
      sender_type: "contact",
      content: message,
      status: "simulated",
    });

    // 4. If bot is active, trigger bot response
    let botReplied = false;
    if (conversation.bot_active) {
      try {
        await handleInboxMessage(conversation.id);
        botReplied = true;
      } catch (err: any) {
        console.error("[Simulate] Bot error:", err.message);
      }
    }

    return NextResponse.json({
      conversation_id: conversation.id,
      contact_id: contact.id,
      message_id: msg.id,
      bot_replied: botReplied,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
