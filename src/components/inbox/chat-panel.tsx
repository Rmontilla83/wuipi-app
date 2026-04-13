"use client";

import { useState, useRef, useEffect } from "react";
import { useInboxStore } from "@/hooks/useInboxStore";
import { CHANNEL_CONFIG, CONVERSATION_STATUS_CONFIG } from "@/types/inbox";
import { Send, Bot, MessageSquare, ArrowLeft } from "lucide-react";
import MessageBubble from "./message-bubble";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";

export default function ChatPanel({ onBack }: { onBack?: () => void }) {
  const {
    selectedId, conversations, messages, messagesLoading,
    sendMessage, updateConversation,
  } = useInboxStore();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to Realtime messages for selected conversation
  useRealtimeMessages(selectedId);

  const conversation = conversations.find((c) => c.id === selectedId);
  const messageList = selectedId ? messages.get(selectedId) || [] : [];

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messageList.length]);

  const handleSend = async () => {
    if (!input.trim() || !selectedId || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      await sendMessage(selectedId, text);
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

  const toggleBot = async () => {
    if (!selectedId || !conversation) return;
    const newBotActive = !conversation.bot_active;
    try {
      await fetch(`/api/inbox/conversations/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_active: newBotActive,
          status: newBotActive ? "bot" : "active",
        }),
      });
      updateConversation(selectedId, {
        bot_active: newBotActive,
        status: newBotActive ? "bot" : "active",
      });
    } catch (err) {
      console.error("[Chat] Error toggling bot:", err);
    }
  };

  // Empty state
  if (!selectedId || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">Selecciona una conversación</p>
          <p className="text-xs text-gray-600 mt-1">O simula un mensaje para empezar</p>
        </div>
      </div>
    );
  }

  const channelCfg = CHANNEL_CONFIG[conversation.channel] || CHANNEL_CONFIG.manual;
  const statusCfg = CONVERSATION_STATUS_CONFIG[conversation.status] || CONVERSATION_STATUS_CONFIG.active;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-wuipi-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-1 rounded-lg hover:bg-wuipi-bg text-gray-400 lg:hidden">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className={`w-8 h-8 rounded-full ${channelCfg.bg} flex items-center justify-center`}>
            <span className={`text-sm font-bold ${channelCfg.color}`}>
              {(conversation.crm_contacts?.display_name || "?")[0].toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {conversation.crm_contacts?.display_name || "Sin nombre"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${channelCfg.bg} ${channelCfg.color}`}>
                {channelCfg.label}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${statusCfg.bg} ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>
          </div>
        </div>

        {/* Bot toggle */}
        <button onClick={toggleBot}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            conversation.bot_active
              ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20"
              : "bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700"
          }`}>
          <Bot size={14} />
          {conversation.bot_active ? "Bot ON" : "Bot OFF"}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-1">
        {messagesLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-xs">
            Cargando mensajes...
          </div>
        ) : messageList.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-600 text-xs">
            Sin mensajes aún
          </div>
        ) : (
          messageList.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-wuipi-border">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 bg-wuipi-bg border border-wuipi-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent resize-none max-h-32"
            style={{ minHeight: "40px" }}
          />
          <button onClick={handleSend} disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-wuipi-accent text-white hover:bg-wuipi-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
            <Send size={18} />
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1 ml-1">
          Enter para enviar, Shift+Enter para salto de línea
          {conversation.bot_active && " · Bot responderá automáticamente"}
        </p>
      </div>
    </div>
  );
}
