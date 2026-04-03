"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { RefreshCw, Eye, ArrowLeft, FileText, Package, HelpCircle } from "lucide-react";
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

export default function PortalPreview() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const [data, setData] = useState<OdooClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"facturas" | "servicios" | "soporte">("facturas");

  useEffect(() => {
    fetch(`/api/odoo/clients/${partnerId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
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
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-emerald-400 font-semibold">Esta al dia</p>
                  <p className="text-xs text-gray-500 mt-1">No tiene saldo pendiente</p>
                </div>
              )}
            </Card>

            {/* Pending */}
            {pending.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-400 mb-2">Facturas pendientes ({pending.length})</h3>
                <div className="space-y-2">
                  {pending.map((inv) => (
                    <Card key={inv.id} className="!p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white text-sm font-mono font-medium">{inv.invoice_number || "Borrador"}</p>
                          <p className="text-gray-500 text-[10px]">Vence {inv.due_date}</p>
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

            {/* Paid history */}
            {paid.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Historial ({paid.length})</h3>
                <Card className="!p-0 overflow-hidden">
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
                </Card>
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
          <Card className="text-center py-12">
            <HelpCircle size={32} className="mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400 text-sm">Seccion de soporte del cliente</p>
          </Card>
        )}
      </main>
    </div>
  );
}
