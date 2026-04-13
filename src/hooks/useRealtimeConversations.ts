"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useInboxStore } from "./useInboxStore";
import type { InboxConversation } from "@/types/inbox";

/**
 * Subscribe to conversation updates via Supabase Realtime.
 * When a conversation's last_message_at, unread_count, or status changes,
 * update the store so the conversation list stays live.
 */
export function useRealtimeConversations() {
  const updateConversation = useInboxStore((s) => s.updateConversation);
  const fetchConversations = useInboxStore((s) => s.fetchConversations);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("inbox-conversations-live")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "inbox_conversations",
        },
        (payload) => {
          const updated = payload.new as Partial<InboxConversation> & { id: string };
          updateConversation(updated.id, {
            last_message_at: updated.last_message_at,
            last_message_preview: updated.last_message_preview,
            unread_count: updated.unread_count,
            status: updated.status,
            bot_active: updated.bot_active,
            temperature: updated.temperature,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_conversations",
        },
        () => {
          // New conversation created — refetch the list to get full joined data
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [updateConversation, fetchConversations]);
}
