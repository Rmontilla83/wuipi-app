"use client";

import { useEffect, useState, useCallback } from "react";
import { useInboxStore } from "@/hooks/useInboxStore";
import { CHANNEL_CONFIG, CONVERSATION_STATUS_CONFIG } from "@/types/inbox";
import { Search, Zap, MessageSquare, Filter } from "lucide-react";
import SimulateDialog from "./simulate-dialog";
import { useRealtimeConversations } from "@/hooks/useRealtimeConversations";

const timeAgo = (ts: string) => {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};

export default function ConversationList() {
  const {
    conversations, selectedId, loading, filters,
    selectConversation, setFilters, fetchConversations,
  } = useInboxStore();

  const [showSimulate, setShowSimulate] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  // Subscribe to Realtime conversation updates
  useRealtimeConversations();

  // Initial load + refetch on filter change
  useEffect(() => {
    fetchConversations();
  }, [filters.channel, filters.status, fetchConversations]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters({ search: searchInput || undefined });
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput, setFilters]);

  const handleSimulated = useCallback((conversationId: string) => {
    fetchConversations().then(() => {
      selectConversation(conversationId);
    });
  }, [fetchConversations, selectConversation]);

  return (
    <div className="flex flex-col h-full border-r border-wuipi-border">
      {/* Header */}
      <div className="p-3 border-b border-wuipi-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare size={16} /> Conversaciones
          </h2>
          <button onClick={() => setShowSimulate(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
            <Zap size={12} /> Simular
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent"
          />
        </div>

        {/* Channel filters */}
        <div className="flex items-center gap-1 flex-wrap">
          <button onClick={() => setFilters({ channel: undefined })}
            className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
              !filters.channel ? "bg-wuipi-accent/10 text-wuipi-accent" : "text-gray-500 hover:text-gray-300"
            }`}>
            Todos
          </button>
          {(Object.keys(CHANNEL_CONFIG) as Array<keyof typeof CHANNEL_CONFIG>).map((ch) => (
            <button key={ch} onClick={() => setFilters({ channel: filters.channel === ch ? undefined : ch })}
              className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                filters.channel === ch
                  ? `${CHANNEL_CONFIG[ch].bg} ${CHANNEL_CONFIG[ch].color}`
                  : "text-gray-500 hover:text-gray-300"
              }`}>
              {CHANNEL_CONFIG[ch].label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-xs">
            Cargando...
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Filter size={24} className="text-gray-600 mb-2" />
            <p className="text-sm text-gray-500 font-medium">Sin conversaciones</p>
            <p className="text-xs text-gray-600 mt-1">
              Usa &quot;Simular&quot; para crear un mensaje de prueba
            </p>
          </div>
        ) : (
          conversations.map((conv) => {
            const channelCfg = CHANNEL_CONFIG[conv.channel] || CHANNEL_CONFIG.manual;
            const statusCfg = CONVERSATION_STATUS_CONFIG[conv.status] || CONVERSATION_STATUS_CONFIG.active;
            const isSelected = conv.id === selectedId;

            return (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`w-full text-left p-3 border-b border-wuipi-border/50 transition-colors ${
                  isSelected
                    ? "bg-wuipi-accent/5 border-l-2 border-l-wuipi-accent"
                    : "hover:bg-wuipi-card-hover border-l-2 border-l-transparent"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar placeholder */}
                  <div className={`w-9 h-9 rounded-full ${channelCfg.bg} flex items-center justify-center shrink-0`}>
                    <span className={`text-sm font-bold ${channelCfg.color}`}>
                      {(conv.crm_contacts?.display_name || "?")[0].toUpperCase()}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white truncate">
                        {conv.crm_contacts?.display_name || "Sin nombre"}
                      </span>
                      <span className="text-[10px] text-gray-600 shrink-0 ml-2">
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${channelCfg.bg} ${channelCfg.color}`}>
                        {channelCfg.label}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      {conv.on_hold_reason && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-blue-500/10 text-blue-400">
                          En gestión
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500 truncate mt-1">
                      {conv.last_message_preview || "Sin mensajes"}
                    </p>
                  </div>

                  {/* Unread badge */}
                  {conv.unread_count > 0 && (
                    <span className="bg-wuipi-accent text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                      {conv.unread_count > 9 ? "9+" : conv.unread_count}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <SimulateDialog
        open={showSimulate}
        onClose={() => setShowSimulate(false)}
        onSimulated={handleSimulated}
      />
    </div>
  );
}
