"use client";

import { useState } from "react";
import { X, Send, Zap } from "lucide-react";

interface SimulateDialogProps {
  open: boolean;
  onClose: () => void;
  onSimulated: (conversationId: string) => void;
}

export default function SimulateDialog({ open, onClose, onSimulated }: SimulateDialogProps) {
  const [form, setForm] = useState({
    contact_name: "",
    phone: "",
    channel: "whatsapp" as string,
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ bot_replied: boolean; conversation_id: string } | null>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/inbox/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else {
        setResult(json);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDone = () => {
    if (result) {
      onSimulated(result.conversation_id);
    }
    setForm({ contact_name: "", phone: "", channel: "whatsapp", message: "" });
    setResult(null);
    setError("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-wuipi-card border border-wuipi-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-wuipi-border">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Simular Mensaje Entrante</h3>
          </div>
          <button onClick={handleDone} className="p-1 rounded-lg hover:bg-wuipi-bg text-gray-500 hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {result ? (
          /* Result state */
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
              <Send size={20} className="text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-white">Mensaje simulado con éxito</p>
            <p className="text-xs text-gray-400">
              {result.bot_replied ? "El bot respondió automáticamente." : "Bot desactivado — sin respuesta automática."}
            </p>
            <button onClick={handleDone}
              className="px-4 py-2 bg-wuipi-accent text-white text-sm font-medium rounded-lg hover:bg-wuipi-accent/80 transition-colors">
              Ver conversación
            </button>
          </div>
        ) : (
          /* Form state */
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Nombre del contacto *</label>
              <input
                type="text" required
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent"
                placeholder="Juan Pérez"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-1 block">Teléfono</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent"
                  placeholder="04121234567"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 mb-1 block">Canal</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-wuipi-accent"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="web">Web</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Mensaje *</label>
              <textarea
                required rows={3}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full bg-wuipi-bg border border-wuipi-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent resize-none"
                placeholder="Hola, quiero info de planes de internet"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={sending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors">
              {sending ? (
                <><span className="animate-spin">⏳</span> Enviando...</>
              ) : (
                <><Zap size={16} /> Simular mensaje</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
