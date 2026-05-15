"use client";

import { useState, useEffect, useRef } from "react";
import { usePortal } from "@/lib/portal/context";
import { Card } from "@/components/ui/card";
import { Send, Bot } from "lucide-react";

// Página de Soporte del portal. Por ahora SOLO chat con Soportín — la creación
// de tickets quedó oculta hasta que el CRM interno pase a producción. Soportín
// ya escala al WhatsApp del departamento correcto (soporte/cuentas/ventas)
// según la consulta del cliente, así que no se pierde ningún caso por no tener
// el botón de "Crear ticket".

interface WhatsAppHandoff {
  department: string;
  number: string;
  url: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  whatsapp?: WhatsAppHandoff | null;
}

const SUGGESTED = [
  "¿Cuánto debo actualmente?",
  "Explícame mis facturas pendientes",
  "¿Qué plan tengo contratado?",
  "Tengo problemas con mi internet",
  "Quiero cambiar de plan",
];

export default function PortalSoporte() {
  const { partnerId, customerName } = usePortal();

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isTyping]);

  const handleSend = async (text?: string) => {
    const msg = text || chatInput;
    if (!msg.trim() || isTyping) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: msg,
      timestamp: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/portal/soportin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          partnerId,
          history: chatMessages.slice(-10),
        }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.content || "Lo siento, hubo un error. Inténtalo de nuevo.",
        timestamp: new Date().toISOString(),
        whatsapp: data.whatsapp || null,
      }]);
    } catch {
      setChatMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: "No pude conectar con el asistente. Inténtalo de nuevo en un momento.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Soporte</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Chatea con Soportín o te derivamos al departamento correcto por WhatsApp.
        </p>
      </div>

      {/* Soportin Chat */}
      <Card className="!p-0 border-[#0F71F2]/20 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-[#0F71F2]/10 border-b border-[#0F71F2]/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#0F71F2]/20 flex items-center justify-center">
            <Bot size={18} className="text-[#0F71F2]" />
          </div>
          <div className="flex-1">
            <p className="text-white text-sm font-bold">Soportín IA</p>
            <p className="text-gray-400 text-[10px]">Asistente virtual 24/7 — conoce tu cuenta y servicios</p>
          </div>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-400 bg-emerald-400/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            En línea
          </span>
        </div>

        {/* Messages */}
        <div className="h-[420px] overflow-auto p-4 space-y-3">
          {chatMessages.length === 0 && (
            <div className="text-center py-6">
              <Bot size={40} className="mx-auto mb-3 text-[#0F71F2]/40" />
              <p className="text-sm font-medium text-white mb-1">¡Hola {customerName?.split(" ")[0] || ""}! Soy Soportín</p>
              <p className="text-xs text-gray-500 mb-4">
                Tengo acceso a tu cuenta, facturas y servicios. Pregúntame lo que necesites.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => handleSend(q)}
                    className="px-3 py-1.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-xs text-gray-400 hover:text-[#0F71F2] hover:border-[#0F71F2]/30 transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl ${
                msg.role === "user"
                  ? "bg-[#0F71F2]/10 border border-[#0F71F2]/20 rounded-br-sm"
                  : "bg-wuipi-bg border border-wuipi-border rounded-bl-sm"
              }`}>
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Bot size={12} className="text-[#0F71F2]" />
                    <span className="text-[10px] text-[#0F71F2] font-medium">Soportín</span>
                  </div>
                )}
                <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.whatsapp && (
                  <a
                    href={msg.whatsapp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-xs font-medium hover:bg-[#25D366]/20 transition-colors w-fit"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Contactar {msg.whatsapp.department}
                  </a>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-2xl rounded-bl-sm flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#0F71F2]" style={{
                      animation: `soportinPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
                <span className="text-[10px] text-gray-500">Revisando tu cuenta...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-wuipi-border flex gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Escribe tu consulta..."
            className="flex-1 px-3 py-2 bg-wuipi-bg border border-wuipi-border rounded-xl text-sm text-white outline-none focus:border-[#0F71F2]/50 placeholder:text-gray-600"
          />
          <button
            onClick={() => handleSend()}
            disabled={!chatInput.trim() || isTyping}
            className="px-3 py-2 bg-[#0F71F2] rounded-xl text-white disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            <Send size={16} />
          </button>
        </div>
      </Card>

      <style>{`@keyframes soportinPulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }`}</style>
    </div>
  );
}
