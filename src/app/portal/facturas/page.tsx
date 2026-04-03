"use client";

import { useState, useEffect } from "react";
import { usePortal } from "@/lib/portal/context";
import { Card } from "@/components/ui/card";
import { RefreshCw, FileText } from "lucide-react";
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

export default function PortalFacturas() {
  const { partnerId } = usePortal();
  const [invoices, setInvoices] = useState<OdooInvoiceDetail[]>([]);
  const [payments, setPayments] = useState<OdooPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/odoo/clients/${partnerId}`)
      .then((r) => r.json())
      .then((d: OdooClientDetail) => {
        setInvoices(d.invoices || []);
        setPayments(d.payments || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [partnerId]);

  if (loading) {
    return <div className="flex justify-center py-24"><RefreshCw size={20} className="animate-spin text-gray-500" /></div>;
  }

  const pending = invoices.filter((i) => i.amount_due > 0);
  const paid = invoices.filter((i) => i.amount_due === 0);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-white">Mis Facturas</h2>

      {/* Pending invoices */}
      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-2">Facturas pendientes ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map((inv) => (
              <Card key={inv.id} className="!p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-mono font-medium">{inv.invoice_number}</p>
                    <p className="text-gray-500 text-[10px]">{inv.invoice_date} — vence {inv.due_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-400 font-bold text-sm">{fmtAmount(inv.amount_due, inv.currency)}</p>
                    <PaymentBadge state={inv.payment_state} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Paid invoices */}
      {paid.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Historial ({paid.length})</h3>
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-wuipi-border">
                    <th className="text-left p-3 font-medium">Factura</th>
                    <th className="text-left p-3 font-medium">Fecha</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-center p-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.map((inv) => (
                    <tr key={inv.id} className="border-b border-wuipi-border/30">
                      <td className="p-3 text-white font-mono">{inv.invoice_number}</td>
                      <td className="p-3 text-gray-400">{inv.invoice_date}</td>
                      <td className="p-3 text-right text-gray-300">{fmtAmount(inv.total, inv.currency)}</td>
                      <td className="p-3 text-center"><PaymentBadge state={inv.payment_state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
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
                  </tr>
                </thead>
                <tbody>
                  {payments.map((pay) => (
                    <tr key={pay.id} className="border-b border-wuipi-border/30">
                      <td className="p-3 text-gray-400">{pay.date}</td>
                      <td className="p-3 text-right text-emerald-400 font-medium">{fmtAmount(pay.amount, pay.currency)}</td>
                      <td className="p-3 text-gray-300">{pay.journal}</td>
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
