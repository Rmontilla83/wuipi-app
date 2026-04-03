"use client";

import { useState, useEffect } from "react";
import { usePortal } from "@/lib/portal/context";
import { Card } from "@/components/ui/card";
import { RefreshCw, FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { OdooClientDetail, OdooInvoiceDetail, OdooPayment } from "@/types/odoo";

const fmtAmount = (n: number, currency: string) =>
  currency === "USD"
    ? `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `Bs ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PaymentBadge({ state }: { state: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    paid: { label: "Pagada", color: "text-emerald-400 bg-emerald-400/10" },
    in_payment: { label: "En pago", color: "text-blue-400 bg-blue-400/10" },
    not_paid: { label: "Pendiente", color: "text-red-400 bg-red-400/10" },
    partial: { label: "Parcial", color: "text-amber-400 bg-amber-400/10" },
    reversed: { label: "Reversada", color: "text-gray-400 bg-gray-400/10" },
  };
  const c = cfg[state] || { label: state, color: "text-gray-400 bg-gray-400/10" };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${c.color}`}>{c.label}</span>;
}

function InvoiceCard({ inv, defaultExpanded }: { inv: OdooInvoiceDetail; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded || false);
  const isPending = inv.amount_due > 0;

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-wuipi-card-hover transition-colors"
      >
        <div>
          <p className="text-white text-sm font-mono font-medium">{inv.invoice_number || "Borrador"}</p>
          <p className="text-gray-500 text-[10px]">
            {inv.invoice_date ? `${inv.invoice_date} — ` : ""}Vence {inv.due_date}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={`font-bold text-sm ${isPending ? "text-amber-400" : "text-gray-300"}`}>
              {fmtAmount(isPending ? inv.amount_due : inv.total, inv.currency)}
            </p>
            <PaymentBadge state={inv.payment_state} />
          </div>
          {inv.lines.length > 0 && (
            expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />
          )}
        </div>
      </button>
      {expanded && inv.lines.length > 0 && (
        <div className="border-t border-wuipi-border px-4 pb-3 pt-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600">
                <th className="text-left py-1 font-medium">Servicio</th>
                <th className="text-right py-1 font-medium">Precio</th>
                <th className="text-right py-1 font-medium">Cant.</th>
                <th className="text-right py-1 font-medium">Subtotal</th>
                <th className="text-right py-1 font-medium">Con IVA</th>
              </tr>
            </thead>
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
              <tr className="border-t border-wuipi-border">
                <td colSpan={3} className="py-2 text-right text-gray-500 font-medium">Subtotal</td>
                <td className="py-2 text-right text-gray-400">{fmtAmount(inv.lines.reduce((s, l) => s + l.price_subtotal, 0), inv.currency)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={3} className="py-1 text-right text-gray-500 font-medium">IVA</td>
                <td className="py-1 text-right text-gray-400">{fmtAmount(inv.lines.reduce((s, l) => s + (l.price_total - l.price_subtotal), 0), inv.currency)}</td>
                <td></td>
              </tr>
              <tr className="border-t border-wuipi-border">
                <td colSpan={3} className="py-2 text-right text-white font-bold">Total</td>
                <td></td>
                <td className="py-2 text-right text-white font-bold">{fmtAmount(inv.total, inv.currency)}</td>
              </tr>
            </tfoot>
          </table>
          {inv.ref && (
            <p className="text-[10px] text-gray-600 mt-2">Ref: {inv.ref}</p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function PortalFacturas() {
  const { partnerId } = usePortal();
  const [invoices, setInvoices] = useState<OdooInvoiceDetail[]>([]);
  const [payments, setPayments] = useState<OdooPayment[]>([]);
  const [creditVed, setCreditVed] = useState(0);
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/odoo/clients/${partnerId}`)
      .then((r) => r.json())
      .then((d: OdooClientDetail) => {
        setInvoices(d.invoices || []);
        setPayments(d.payments || []);
        setCreditVed(d.credit || 0);
        setTotalDue(d.total_due || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [partnerId]);

  if (loading) {
    return <div className="flex justify-center py-24"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>;
  }

  const pending = invoices.filter((i) => i.amount_due > 0);
  const paid = invoices.filter((i) => i.amount_due === 0);
  const totalPending = pending.reduce((s, i) => s + i.amount_due, 0);
  const hasCreditFavor = creditVed < 0;
  const creditFavorBs = hasCreditFavor ? Math.abs(creditVed) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Mis Facturas</h2>

      {/* Balance summary */}
      <Card className="!p-5 border-wuipi-border">
        {totalDue > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Total facturas pendientes</p>
              <p className="text-sm text-white font-medium">{fmtAmount(totalPending, "USD")}</p>
            </div>
            {hasCreditFavor && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">Saldo a favor</p>
                <p className="text-sm text-emerald-400 font-medium">- {fmtAmount(creditFavorBs, "VED")}</p>
              </div>
            )}
            <div className="border-t border-wuipi-border pt-3 flex items-center justify-between">
              <p className="text-base font-bold text-white">Monto a pagar</p>
              <p className="text-2xl font-bold text-amber-400">{fmtAmount(totalDue, "USD")}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-emerald-400 font-semibold">Estas al dia</p>
            <p className="text-xs text-gray-500 mt-1">No tienes saldo pendiente</p>
          </div>
        )}
      </Card>

      {/* Pending invoices — expandable */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-400 mb-2">Pendientes de pago ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map((inv) => (
              <InvoiceCard key={inv.id} inv={inv} defaultExpanded={false} />
            ))}
          </div>
        </div>
      )}

      {/* Paid invoices — expandable */}
      {paid.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Historial de pagos ({paid.length})</h3>
          <div className="space-y-2">
            {paid.map((inv) => (
              <InvoiceCard key={inv.id} inv={inv} />
            ))}
          </div>
        </div>
      )}

      {invoices.length === 0 && (
        <Card className="text-center py-12">
          <FileText size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400 text-sm">No tienes facturas registradas</p>
        </Card>
      )}

      {/* Recent payments */}
      {payments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Pagos recientes</h3>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-wuipi-border">
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-right p-3 font-medium">Monto</th>
                    <th className="text-left p-3 font-medium">Banco</th>
                    <th className="text-left p-3 font-medium">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pay) => (
                    <tr key={pay.id} className="border-b border-wuipi-border/30">
                      <td className="p-3 text-gray-400">{pay.date}</td>
                      <td className="p-3 text-right text-emerald-400 font-medium">{fmtAmount(pay.amount, pay.currency)}</td>
                      <td className="p-3 text-gray-300">{pay.journal}</td>
                      <td className="p-3 text-gray-500 font-mono text-[10px]">{pay.ref || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
