"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, RefreshCw } from "lucide-react";
import type { InboxMessage } from "@/types/inbox";
import MessageBubble from "./message-bubble";

interface EmbeddedChatProps {
  conversationId: string;
  botActive?: boolean;
  maxHeight?: string;
}

export default function EmbeddedChat({ conversationId, botActive, maxHeight = "400px" }: EmbeddedChatProps) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/messages?limit=50`);
      const json = await res.json();
      setMessages(json.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [conversationId]);

  // Initial load + polling for new messages
  useEffect(() => {
    setLoading(true);
    fetchMessages();
    pollingRef.current = setInterval(fetchMessages, 5_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, sender_type: "agent" }),
      });
      if (res.ok) {
        await fetchMessages();
      }
    } catch (err) {
      console.error("[EmbeddedChat] Error sending:", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-wuipi-border overflow-hidden">
      {/* Messages */}
      <div ref={scrollRef} className="overflow-y-auto p-3 space-y-1 bg-wuipi-bg/50" style={{ maxHeight }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={16} className="animate-spin text-gray-600" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-6">Sin mensajes</p>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-2 border-t border-wuipi-border bg-wuipi-card">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent resize-none"
            style={{ minHeight: "34px", maxHeight: "80px" }}
          />
          <button onClick={handleSend} disabled={!input.trim() || sending}
            className="p-2 rounded-lg bg-wuipi-accent text-white hover:bg-wuipi-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
            <Send size={14} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1 px-1">
          <p className="text-[9px] text-gray-600">
            Enter enviar · Shift+Enter salto
          </p>
          {botActive && (
            <span className="flex items-center gap-1 text-[9px] text-cyan-500">
              <Bot size={10} /> Bot activo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
