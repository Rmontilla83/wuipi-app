"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useInboxStore } from "./useInboxStore";
import type { InboxMessage } from "@/types/inbox";

/**
 * Subscribe to new messages in a conversation via Supabase Realtime.
 * Auto-appends to the store when a new message arrives.
 */
export function useRealtimeMessages(conversationId: string | null) {
  const addMessage = useInboxStore((s) => s.addMessage);

  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`inbox-msg-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "inbox_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as InboxMessage;
          addMessage(conversationId, msg);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, addMessage]);
}
