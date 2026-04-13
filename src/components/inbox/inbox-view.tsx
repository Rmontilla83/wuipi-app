"use client";

import { useState } from "react";
import { useInboxStore } from "@/hooks/useInboxStore";
import ConversationList from "./conversation-list";
import ChatPanel from "./chat-panel";
import ContactSidebar from "./contact-sidebar";

export default function InboxView() {
  const selectedId = useInboxStore((s) => s.selectedId);
  const selectConversation = useInboxStore((s) => s.selectConversation);

  // Mobile: show list or chat
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  const handleSelect = (id: string) => {
    selectConversation(id);
    setMobileView("chat");
  };

  const handleBack = () => {
    selectConversation(null);
    setMobileView("list");
  };

  return (
    <div className="bg-wuipi-card border border-wuipi-border rounded-xl overflow-hidden"
      style={{ height: "calc(100vh - 180px)" }}>
      {/* Desktop layout: 3 columns */}
      <div className="hidden lg:flex h-full">
        <div className="w-[340px] shrink-0">
          <ConversationList />
        </div>
        <ChatPanel />
        <ContactSidebar />
      </div>

      {/* Mobile layout: list or chat */}
      <div className="lg:hidden h-full">
        {mobileView === "list" ? (
          <ConversationList />
        ) : (
          <ChatPanel onBack={handleBack} />
        )}
      </div>
    </div>
  );
}
