"use client";

import { useState } from "react";
import { useInboxStore } from "@/hooks/useInboxStore";
import { CHANNEL_CONFIG } from "@/types/inbox";
import {
  User, Phone, Mail, Link2, Bot, Thermometer,
  MessageCircle, Instagram, Facebook, Globe,
} from "lucide-react";

const TEMP_CONFIG = {
  frio: { label: "Frío", color: "text-blue-400", bg: "bg-blue-500/10" },
  tibio: { label: "Tibio", color: "text-amber-400", bg: "bg-amber-500/10" },
  caliente: { label: "Caliente", color: "text-red-400", bg: "bg-red-500/10" },
};

const CHANNEL_ICONS: Record<string, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  web: Globe,
};

export default function ContactSidebar() {
  const { selectedId, conversations } = useInboxStore();
  const [linkingLead, setLinkingLead] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");

  const conversation = conversations.find((c) => c.id === selectedId);
  if (!conversation) return null;

  const contact = conversation.crm_contacts;
  const lead = conversation.crm_leads;
  const tempCfg = TEMP_CONFIG[conversation.temperature] || TEMP_CONFIG.frio;
  const botFields = (conversation.bot_fields || {}) as Record<string, string>;
  const fieldEntries = Object.entries(botFields).filter(([, v]) => v);

  const handleLinkLead = async (leadId: string) => {
    try {
      await fetch(`/api/inbox/conversations/${conversation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
      setLinkingLead(false);
      setLeadSearch("");
      // Refresh conversations
      useInboxStore.getState().fetchConversations();
    } catch (err) {
      console.error("[Sidebar] Error linking lead:", err);
    }
  };

  return (
    <div className="w-[280px] border-l border-wuipi-border overflow-auto hidden xl:block">
      <div className="p-4 space-y-4">
        {/* Contact Info */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Contacto</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User size={14} className="text-gray-500" />
              <span className="text-sm text-white font-medium">{contact?.display_name || "—"}</span>
            </div>
            {contact?.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-gray-500" />
                <span className="text-xs text-gray-300">{contact.phone}</span>
              </div>
            )}
            {contact?.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-gray-500" />
                <span className="text-xs text-gray-300">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Channel IDs */}
          <div className="mt-3 space-y-1">
            {contact?.wa_id && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-green-400">WA:</span>
                <span className="text-gray-400 font-mono">{contact.wa_id}</span>
              </div>
            )}
            {contact?.ig_id && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-pink-400">IG:</span>
                <span className="text-gray-400 font-mono">{contact.ig_id}</span>
              </div>
            )}
            {contact?.fb_id && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-blue-400">FB:</span>
                <span className="text-gray-400 font-mono">{contact.fb_id}</span>
              </div>
            )}
          </div>
        </div>

        {/* Lead */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Lead Vinculado</h3>
          {lead ? (
            <div className="p-3 bg-wuipi-bg border border-wuipi-border rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-500">{lead.code}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-wuipi-accent/10 text-wuipi-accent font-semibold">
                  {lead.stage}
                </span>
              </div>
              <p className="text-sm font-medium text-white mt-1 truncate">{lead.name}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Sin lead vinculado</p>
              {!linkingLead ? (
                <button onClick={() => setLinkingLead(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-wuipi-bg border border-wuipi-border text-gray-300 hover:bg-wuipi-card-hover transition-colors">
                  <Link2 size={12} /> Vincular lead
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent"
                  />
                  <div className="flex gap-1">
                    <button onClick={() => setLinkingLead(false)}
                      className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Temperature */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Temperatura</h3>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${tempCfg.bg} ${tempCfg.color}`}>
            <Thermometer size={14} />
            {tempCfg.label}
          </div>
        </div>

        {/* Bot Status */}
        <div>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Bot</h3>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
            conversation.bot_active
              ? "bg-cyan-500/10 text-cyan-400"
              : "bg-gray-800 text-gray-500"
          }`}>
            <Bot size={14} />
            {conversation.bot_active ? "Activo" : "Desactivado"}
          </div>
        </div>

        {/* Bot-collected fields */}
        {fieldEntries.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Datos Recopilados</h3>
            <div className="space-y-1.5">
              {fieldEntries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-[10px] text-gray-500 uppercase w-20 shrink-0 mt-0.5">{key}</span>
                  <span className="text-xs text-gray-300">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
