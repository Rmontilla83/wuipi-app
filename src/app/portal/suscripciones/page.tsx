"use client";

import { useState, useEffect } from "react";
import { usePortal } from "@/lib/portal/context";
import { Card } from "@/components/ui/card";
import { RefreshCw, Wifi, CheckCircle2, Pause, ArrowRightLeft, Send } from "lucide-react";
import type { OdooClientDetail, OdooSubscription } from "@/types/odoo";

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StateBadge({ state }: { state: string }) {
  if (state === "3_progress") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-400 bg-emerald-400/10"><CheckCircle2 size={10} />Activa</span>;
  if (state === "4_paused") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-400 bg-amber-400/10"><Pause size={10} />Pausada</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] text-gray-400 bg-gray-400/10">{state}</span>;
}

export default function PortalSuscripciones() {
  const { partnerId, customerName, email } = usePortal();
  const [subs, setSubs] = useState<OdooSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<OdooSubscription | null>(null);
  const [requestedPlan, setRequestedPlan] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/odoo/clients/${partnerId}`)
      .then((r) => r.json())
      .then((d: OdooClientDetail) => setSubs(d.subscriptions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [partnerId]);

  const handleRequestChange = async () => {
    if (!showForm || !requestedPlan.trim()) return;
    setSending(true);
    try {
      const currentPlan = showForm.lines.map((l) => l.product_name).join(", ");
      await fetch("/api/portal/plan-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odoo_partner_id: partnerId,
          customer_email: email,
          customer_name: customerName,
          subscription_name: showForm.name,
          current_plan: currentPlan,
          requested_plan: requestedPlan,
          notes,
        }),
      });
      setSent(true);
      setTimeout(() => { setShowForm(null); setSent(false); setRequestedPlan(""); setNotes(""); }, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Mis Suscripciones</h2>

      {subs.length === 0 ? (
        <Card className="text-center py-12">
          <Wifi size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400 text-sm">No tienes suscripciones activas</p>
        </Card>
      ) : (
        subs.map((sub) => (
          <Card key={sub.id} className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-white font-mono text-sm font-bold">{sub.name}</span>
                <StateBadge state={sub.state} />
              </div>
              <p className="text-cyan-400 font-bold text-sm">{fmtUSD(sub.recurring_monthly)}<span className="text-gray-500 font-normal text-xs">/mes</span></p>
            </div>

            {/* Lines */}
            <div className="space-y-1.5 mb-3">
              {sub.lines.map((line, i) => (
                <div key={i} className="flex items-center justify-between bg-wuipi-bg rounded-lg px-3 py-2 border border-wuipi-border">
                  <div>
                    <p className="text-white text-xs font-medium">{line.product_name}</p>
                    <p className="text-gray-600 text-[10px] font-mono">{line.product_code}</p>
                  </div>
                  <p className="text-gray-300 text-xs">{fmtUSD(line.price_unit)}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[10px] text-gray-500 space-x-3">
                <span>Inicio: {sub.start_date || "—"}</span>
                <span>Próx. factura: {sub.next_invoice_date || "—"}</span>
              </div>
              <button
                onClick={() => setShowForm(sub)}
                className="flex items-center gap-1 text-xs text-wuipi-accent hover:underline"
              >
                <ArrowRightLeft size={12} /> Solicitar cambio
              </button>
            </div>

            {/* Change request form */}
            {showForm?.id === sub.id && (
              <div className="mt-3 pt-3 border-t border-wuipi-border space-y-3">
                {sent ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <CheckCircle2 size={16} /> Solicitud enviada. Te contactaremos pronto.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Plan deseado</label>
                      <input
                        value={requestedPlan}
                        onChange={(e) => setRequestedPlan(e.target.value)}
                        placeholder="Ej: Fibra 300, Beam 100..."
                        className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Notas (opcional)</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-wuipi-accent/50 focus:outline-none resize-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRequestChange}
                        disabled={sending || !requestedPlan.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-wuipi-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                        Enviar solicitud
                      </button>
                      <button onClick={() => setShowForm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
