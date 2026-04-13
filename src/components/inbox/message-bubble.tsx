"use client";

import type { InboxMessage } from "@/types/inbox";
import { Bot, User, Monitor } from "lucide-react";

const timeStr = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
};

export default function MessageBubble({ message }: { message: InboxMessage }) {
  const isInbound = message.direction === "inbound";
  const isBot = message.sender_type === "bot";
  const isSystem = message.sender_type === "system" || message.content_type === "system";

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/50 border border-gray-700/50">
          <Monitor size={12} className="text-gray-500" />
          <span className="text-[11px] text-gray-500">{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isInbound ? "justify-start" : "justify-end"} mb-2`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isInbound
          ? "bg-wuipi-card border border-wuipi-border rounded-bl-md"
          : isBot
            ? "bg-cyan-500/10 border border-cyan-500/20 rounded-br-md"
            : "bg-wuipi-accent/15 border border-wuipi-accent/20 rounded-br-md"
      }`}>
        {/* Sender label */}
        {!isInbound && (
          <div className="flex items-center gap-1.5 mb-1">
            {isBot ? (
              <><Bot size={11} className="text-cyan-400" /><span className="text-[10px] font-semibold text-cyan-400">Bot IA</span></>
            ) : (
              <><User size={11} className="text-wuipi-accent" /><span className="text-[10px] font-semibold text-wuipi-accent">Agente</span></>
            )}
          </div>
        )}

        {/* Content */}
        <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{message.content}</p>

        {/* Footer: time + status */}
        <div className={`flex items-center gap-2 mt-1 ${isInbound ? "justify-start" : "justify-end"}`}>
          <span className="text-[10px] text-gray-600">{timeStr(message.created_at)}</span>
          {message.status === "simulated" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-500 font-medium">simulado</span>
          )}
        </div>
      </div>
    </div>
  );
}
