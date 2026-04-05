"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { RefreshCw, Eye, ArrowLeft, FileText, Package, HelpCircle, ChevronDown, ChevronUp, CreditCard, Bot, MessageSquare, Send } from "lucide-react";
import type { OdooClientDetail, OdooInvoiceDetail } from "@/types/odoo";
import Link from "next/link";

const fmtAmount = (n: number, currency: string) =>
  currency === "USD"
    ? `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PaymentBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    paid: { label: "Pagada", color: "text-emerald-400 bg-emerald-400/10" },
    not_paid: { label: "Pendiente", color: "text-red-400 bg-red-400/10" },
  };
  const c = cfg[state] || { label: state, color: "text-gray-400 bg-gray-400/10" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

function ExpandableInvoice({ inv, defaultExpanded }: { inv: OdooInvoiceDetail; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false);
  const isPending = inv.amount_due > 0;
  return (
    <Card className="!p-0 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full p-4 flex items-center justify-between text-left hover:bg-wuipi-card-hover transition-colors">
        <div>
          <p className="text-white text-sm font-mono font-medium">{inv.invoice_number || "Borrador"}</p>
          <p className="text-gray-500 text-[10px]">{inv.invoice_date ? `${inv.invoice_date} — ` : ""}Vence {inv.due_date}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={`font-bold text-sm ${isPending ? "text-amber-400" : "text-gray-300"}`}>{fmtAmount(isPending ? inv.amount_due : inv.total, inv.currency)}</p>
            <PaymentBadge state={inv.payment_state} />
          </div>
          {inv.lines && inv.lines.length > 0 && (expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />)}
        </div>
      </button>
      {expanded && inv.lines && inv.lines.length > 0 && (
        <div className="border-t border-wuipi-border px-4 pb-3 pt-2">
          <table className="w-full text-xs">
            <thead><tr className="text-gray-600"><th className="text-left py-1 font-medium">Servicio</th><th className="text-right py-1 font-medium">Precio</th><th className="text-right py-1 font-medium">Cant.</th><th className="text-right py-1 font-medium">Subtotal</th><th className="text-right py-1 font-medium">Con IVA</th></tr></thead>
            <tbody>
              {inv.lines.map((line, i) => (
                <tr key={i} className="border-t border-wuipi-border/20">
                  <td className="py-1.5 text-gray-300">{line.product_name}</td>
                  <td className="py-1.5 text-right text-gray-400">{fmtAmount(line.price_unit, inv.currency)}</td>
                  <td className="py-1.5 text-right text-gray-500">{line.quantity}</td>
                  <td className="py-1.5 text-right text-gray-400">{fmtAmount(line.price_subtotal, inv.currency)}</td>
                  <td className="py-1.5 text-right text-white font-medium">{fmtAmount(line.price_total, inv.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-wuipi-border"><td colSpan={3} className="py-2 text-right text-gray-500 font-medium">Subtotal</td><td className="py-2 text-right text-gray-400">{fmtAmount(inv.lines.reduce((s, l) => s + l.price_subtotal, 0), inv.currency)}</td><td></td></tr>
              <tr><td colSpan={3} className="py-1 text-right text-gray-500 font-medium">IVA</td><td className="py-1 text-right text-gray-400">{fmtAmount(inv.lines.reduce((s, l) => s + (l.price_total - l.price_subtotal), 0), inv.currency)}</td><td></td></tr>
              <tr className="border-t border-wuipi-border"><td colSpan={3} className="py-2 text-right text-white font-bold">Total</td><td></td><td className="py-2 text-right text-white font-bold">{fmtAmount(inv.total, inv.currency)}</td></tr>
            </tfoot>
          </table>
          {inv.payments && inv.payments.length > 0 && (
            <div className="mt-3 pt-2 border-t border-wuipi-border/30">
              <p className="text-[10px] text-gray-500 font-medium mb-1">Pagos vinculados</p>
              {inv.payments.map((pay, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1">
                  <span className="text-gray-400">{pay.date}</span>
                  <span className="text-emerald-400 font-medium">{fmtAmount(pay.amount, inv.currency)}</span>
                  <span className="text-gray-300">{pay.journal_name}</span>
                  <span className="text-gray-500 font-mono text-[10px]">{pay.ref || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const SOPORTIN_SUGGESTED = [
  "Cuanto debo?", "Explicame mis facturas", "Que plan tengo?", "Problemas con internet", "Cambiar de plan",
];

function SoportinChat({ partnerId, customerName }: { partnerId: number; customerName: string }) {
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  const send = async (text?: string) => {
    const msg = text || input;
    if (!msg.trim() || typing) return;
    const userMsg = { id: `u-${Date.now()}`, role: "user" as const, content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);
    try {
      const res = await fetch("/api/portal/soportin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, partnerId, history: messages.slice(-10) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: data.content || "Error, intenta de nuevo." }]);
    } catch {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: "No pude conectar. Intenta de nuevo." }]);
    } finally { setTyping(false); }
  };

  return (
    <Card className="!p-0 border-[#0F71F2]/20 overflow-hidden">
      <div className="px-4 py-3 bg-[#0F71F2]/10 border-b border-[#0F71F2]/20 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#0F71F2]/20 flex items-center justify-center">
          <Bot size={18} className="text-[#0F71F2]" />
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-bold">Soportin IA</p>
          <p className="text-gray-400 text-[10px]">Asistente virtual — conoce la cuenta de este cliente</p>
        </div>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-emerald-400 bg-emerald-400/10">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> En linea
        </span>
      </div>
      <div className="h-[320px] overflow-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot size={36} className="mx-auto mb-2 text-[#0F71F2]/40" />
            <p className="text-sm text-white mb-1">Hola! Soy Soportin</p>
            <p className="text-xs text-gray-500 mb-3">Tengo acceso a las facturas, servicios y pagos de {customerName?.split(" ")[0]}.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SOPORTIN_SUGGESTED.map(q => (
                <button key={q} onClick={() => send(q)}
                  className="px-2.5 py-1 bg-wuipi-bg border border-wuipi-border rounded-lg text-[11px] text-gray-400 hover:text-[#0F71F2] hover:border-[#0F71F2]/30 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
              msg.role === "user" ? "bg-[#0F71F2]/10 border border-[#0F71F2]/20 rounded-br-sm text-gray-200"
                : "bg-wuipi-bg border border-wuipi-border rounded-bl-sm text-gray-200"
            }`}>
              {msg.role === "assistant" && <div className="flex items-center gap-1 mb-1"><Bot size={10} className="text-[#0F71F2]" /><span className="text-[10px] text-[#0F71F2] font-medium">Soportin</span></div>}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-wuipi-bg border border-wuipi-border rounded-2xl rounded-bl-sm flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Revisando cuenta...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="px-4 py-3 border-t border-wuipi-border flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Escribe tu consulta..." className="flex-1 px-3 py-2 bg-wuipi-bg border border-wuipi-border rounded-xl text-sm text-white outline-none focus:border-[#0F71F2]/50 placeholder:text-gray-600" />
        <button onClick={() => send()} disabled={!input.trim() || typing}
          className="px-3 py-2 bg-[#0F71F2] rounded-xl text-white disabled:opacity-30 hover:opacity-90">
          <Send size={16} />
        </button>
      </div>
    </Card>
  );
}

export default function PortalPreview() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const [data, setData] = useState<OdooClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"facturas" | "servicios" | "soporte">("facturas");
  const [paymentUrl, setPaymentUrl] = useState("");

  useEffect(() => {
    fetch(`/api/odoo/clients/${partnerId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch(`/api/portal/payment-link?partnerId=${partnerId}`)
      .then((r) => r.json())
      .then((d) => { if (d.url) setPaymentUrl(d.url); })
      .catch(() => {});
  }, [partnerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-wuipi-bg flex items-center justify-center">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-wuipi-bg flex items-center justify-center">
        <p className="text-gray-400">Cliente no encontrado</p>
      </div>
    );
  }

  const pending = data.invoices.filter((i: OdooInvoiceDetail) => i.amount_due > 0);
  const paid = data.invoices.filter((i: OdooInvoiceDetail) => i.amount_due === 0);
  const totalServices = data.subscriptions.reduce((s, sub) => s + sub.lines.length, 0);
  const hasCreditFavor = data.credit < 0;
  const creditFavorBs = hasCreditFavor ? Math.abs(data.credit) : 0;
  const hasCreditDebt = data.credit > 0;
  const creditDebtBs = hasCreditDebt ? data.credit : 0;
  const totalPending = pending.reduce((s, i) => s + i.amount_due, 0);

  const tabs = [
    { id: "facturas" as const, label: "Facturas", icon: FileText, count: data.invoices.length },
    { id: "servicios" as const, label: "Servicios", icon: Package, count: totalServices },
    { id: "soporte" as const, label: "Soporte", icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-wuipi-bg">
      {/* Admin banner */}
      <div className="bg-violet-500/10 border-b border-violet-500/30 px-4 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-violet-400 text-xs font-medium">
            <Eye size={14} />
            Vista de administrador — {data.name}
          </div>
          <Link
            href={`/clientes/${partnerId}`}
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
          >
            <ArrowLeft size={12} /> Volver al dashboard
          </Link>
        </div>
      </div>

      {/* Portal header mock */}
      <header className="sticky top-0 z-50 bg-wuipi-card/95 backdrop-blur border-b border-wuipi-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <img src="/img/wuipi-logo.webp" alt="Wuipi" className="h-20 object-contain" />
          <span className="text-sm text-gray-400">{data.name}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex gap-1 border-b border-wuipi-border mb-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-wuipi-accent text-wuipi-accent"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <t.icon size={14} />
              {t.label}
              {t.count !== undefined && <span className="text-gray-600">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 pb-8 space-y-6">
        {tab === "facturas" && (
          <>
            {/* Balance */}
            <Card className="!p-5 border-wuipi-border">
              {data.total_due > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400">Total facturas pendientes</p>
                    <p className="text-sm text-white font-medium">{fmtAmount(totalPending, "USD")}</p>
                  </div>
                  {hasCreditDebt && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-400">Saldo pendiente anterior</p>
                      <p className="text-sm text-red-400 font-medium">+ {fmtAmount(creditDebtBs, "VED")}</p>
                    </div>
                  )}
                  {hasCreditFavor && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-400">Saldo a favor</p>
                      <p className="text-sm text-emerald-400 font-medium">- {fmtAmount(creditFavorBs, "VED")}</p>
                    </div>
                  )}
                  <div className="border-t border-wuipi-border pt-3 flex items-center justify-between">
                    <p className="text-base font-bold text-white">Monto a pagar</p>
                    <p className="text-2xl font-bold text-amber-400">{fmtAmount(data.total_due, "USD")}</p>
                  </div>
                  {paymentUrl && (
                    <a
                      href={paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 w-full py-3.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                    >
                      <CreditCard size={18} />
                      Pagar {fmtAmount(data.total_due, "USD")}
                    </a>
                  )}
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-emerald-400 font-semibold">Esta al dia</p>
                  <p className="text-xs text-gray-500 mt-1">No tiene saldo pendiente</p>
                </div>
              )}
            </Card>

            {/* Pending — expandable */}
            {pending.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-400 mb-2">Pendientes de pago ({pending.length})</h3>
                <div className="space-y-2">
                  {pending.map((inv) => (
                    <ExpandableInvoice key={inv.id} inv={inv} />
                  ))}
                </div>
              </div>
            )}

            {/* Paid — expandable */}
            {paid.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Historial de pagos ({paid.length})</h3>
                <div className="space-y-2">
                  {paid.map((inv) => (
                    <ExpandableInvoice key={inv.id} inv={inv} />
                  ))}
                </div>
              </div>
            )}

          </>
        )}

        {tab === "servicios" && (
          <div className="space-y-3">
            {data.subscriptions.map((sub) => (
              <Card key={sub.id} className="!p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-mono text-sm font-bold">{sub.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    sub.state === "3_progress" ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400 bg-amber-400/10"
                  }`}>
                    {sub.state === "3_progress" ? "Activa" : "Pausada"}
                  </span>
                </div>
                <div className="space-y-1">
                  {sub.lines.map((line, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-wuipi-border/20 last:border-0">
                      <span className="text-gray-300">{line.product_name}</span>
                      <span className="text-cyan-400 font-medium">{fmtAmount(line.price_unit, "USD")}/mes</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "soporte" && (
          <SoportinChat partnerId={parseInt(partnerId)} customerName={data?.name || ""} />
        )}
      </main>
    </div>
  );
}
