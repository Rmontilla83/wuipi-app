import { create } from "zustand";
import type { InboxConversation, InboxMessage } from "@/types/inbox";

interface InboxState {
  conversations: InboxConversation[];
  selectedId: string | null;
  messages: Map<string, InboxMessage[]>;
  filters: { channel?: string; status?: string; search?: string };
  loading: boolean;
  messagesLoading: boolean;

  // Actions
  setConversations: (convs: InboxConversation[]) => void;
  selectConversation: (id: string | null) => void;
  setFilters: (filters: Partial<InboxState["filters"]>) => void;
  addMessage: (convId: string, msg: InboxMessage) => void;
  setMessages: (convId: string, msgs: InboxMessage[]) => void;
  updateConversation: (id: string, updates: Partial<InboxConversation>) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (convId: string) => Promise<void>;
  sendMessage: (convId: string, content: string) => Promise<void>;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  conversations: [],
  selectedId: null,
  messages: new Map(),
  filters: {},
  loading: false,
  messagesLoading: false,

  setConversations: (convs) => set({ conversations: convs }),

  selectConversation: (id) => {
    set({ selectedId: id });
    if (id) {
      get().fetchMessages(id);
      // Mark as read
      fetch(`/api/inbox/conversations/${id}/read`, { method: "POST" }).catch(() => {});
    }
  },

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  addMessage: (convId, msg) =>
    set((state) => {
      const newMap = new Map(state.messages);
      const existing = newMap.get(convId) || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === msg.id)) return state;
      newMap.set(convId, [...existing, msg]);

      // Update conversation preview
      const conversations = state.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              last_message_preview: msg.content.slice(0, 100),
              last_message_at: msg.created_at,
              unread_count: c.id === state.selectedId ? 0 : c.unread_count + 1,
            }
          : c
      );
      // Re-sort by last_message_at
      conversations.sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );

      return { messages: newMap, conversations };
    }),

  setMessages: (convId, msgs) =>
    set((state) => {
      const newMap = new Map(state.messages);
      newMap.set(convId, msgs);
      return { messages: newMap };
    }),

  updateConversation: (id, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  fetchConversations: async () => {
    set({ loading: true });
    try {
      const { filters } = get();
      const params = new URLSearchParams();
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.status) params.set("status", filters.status);
      if (filters.search) params.set("search", filters.search);
      params.set("limit", "100");

      const res = await fetch(`/api/inbox/conversations?${params}`);
      const json = await res.json();
      if (json.data) set({ conversations: json.data });
    } catch (err) {
      console.error("[Inbox] Error fetching conversations:", err);
    } finally {
      set({ loading: false });
    }
  },

  fetchMessages: async (convId) => {
    set({ messagesLoading: true });
    try {
      const res = await fetch(`/api/inbox/conversations/${convId}/messages?limit=100`);
      const json = await res.json();
      if (json.data) {
        const newMap = new Map(get().messages);
        newMap.set(convId, json.data);
        set({ messages: newMap, messagesLoading: false });
      }
    } catch (err) {
      console.error("[Inbox] Error fetching messages:", err);
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (convId, content) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const msg = await res.json();
      if (msg.id) {
        get().addMessage(convId, msg);
      }
    } catch (err) {
      console.error("[Inbox] Error sending message:", err);
    }
  },
}));
