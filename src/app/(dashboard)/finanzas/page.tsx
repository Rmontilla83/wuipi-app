"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { ScoreRing, LoadBar } from "@/components/dashboard";
import type { FinanceOverview, ClientDebt, Invoice } from "@/types/finance";
import { PAYMENT_METHOD_LABELS, INVOICE_STATUS_LABELS } from "@/types/finance";
import {
  DollarSign, RefreshCw, TrendingUp, TrendingDown, Users, FileText,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Landmark, Receipt, Scale,
  CreditCard, UserMinus, BarChart3,
} from "lucide-react";

function MetricCard({ label, value, sub, icon: Icon, color = "text-white", trend }: {
  label: string; value: string; sub?: string; icon: any; color?: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-gray-500" />
          <span className="text-xs text-gray-500">{label}</span>
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-semibold ${trend.positive ? "text-emerald-400" : "text-red-400"}`}>
            {trend.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.value}
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Card>
  );
}

function DebtorRow({ debtor }: { debtor: ClientDebt }) {
  const severity = debtor.months_overdue >= 3 ? "border-red-500/20 bg-red-500/5" : debtor.months_overdue >= 2 ? "border-amber-500/20 bg-amber-500/5" : "border-wuipi-border";
  return (
    <div className={`p-3 rounded-xl border ${severity}`}>
      <div className="flex justify-between items-start mb-1">
        <div>
          <p className="text-sm font-semibold text-white">{debtor.client_name}</p>
          <p className="text-xs text-gray-500">{debtor.client_rif} · {debtor.zone}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-red-400">${debtor.total_debt_usd}</p>
          <p className="text-[10px] text-gray-500">Bs {debtor.total_debt_bs.toLocaleString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
        <span className={`font-semibold ${debtor.months_overdue >= 3 ? "text-red-400" : "text-amber-400"}`}>
          {debtor.months_overdue} meses
        </span>
        <span>{debtor.invoices_overdue} facturas</span>
        <span>{debtor.plan}</span>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const statusColors: Record<string, string> = {
    paid: "bg-emerald-500/10 text-emerald-400",
    issued: "bg-cyan-500/10 text-cyan-400",
    overdue: "bg-red-500/10 text-red-400",
    cancelled: "bg-gray-500/10 text-gray-400",
    credit_note: "bg-violet-500/10 text-violet-400",
    draft: "bg-gray-500/10 text-gray-500",
  };
  return (
    <div className="flex items-center gap-3 p-2.5 bg-wuipi-bg rounded-lg border border-wuipi-border">
      <FileText size={14} className="text-gray-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400">#{invoice.number}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[invoice.status]}`}>
            {INVOICE_STATUS_LABELS[invoice.status]}
          </span>
        </div>
        <p className="text-sm text-white truncate">{invoice.client_name}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white">${invoice.total_usd}</p>
        <p className="text-[10px] text-gray-500">Bs {invoice.total_bs.toLocaleString()}</p>
      </div>
    </div>
  );
}

export default function FinanzasPage() {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/finanzas");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error fetching finance data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading || !data) {
    return (
      <>
        <TopBar title="Finanzas" icon={<DollarSign size={22} />} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw size={20} className="animate-spin" /> Cargando finanzas...
          </div>
        </div>
      </>
    );
  }

  const maxMethodAmount = Math.max(...data.collections.by_method.map(m => m.amount_usd));

  return (
    <>
      <TopBar title="Finanzas" icon={<DollarSign size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Top KPIs */}
        <div className="grid grid-cols-6 gap-3">
          <MetricCard label="MRR" value={`$${data.revenue.mrr.toLocaleString()}`} icon={TrendingUp} color="text-cyan-400"
            trend={{ value: `${data.revenue.mrr_growth}%`, positive: data.revenue.mrr_growth > 0 }}
            sub={`ARR: $${data.revenue.arr.toLocaleString()}`} />
          <MetricCard label="Cobranza" value={`${data.collections.collection_rate}%`} icon={CreditCard}
            color={data.collections.collection_rate >= 85 ? "text-emerald-400" : "text-amber-400"}
            sub={`$${data.collections.total_collected_usd.toLocaleString()} cobrado`} />
          <MetricCard label="Morosos" value={data.total_debtors.toString()} icon={UserMinus} color="text-red-400"
            sub={`$${data.collections.total_overdue_usd.toLocaleString()} vencido`} />
          <MetricCard label="ARPU" value={`$${data.revenue.arpu}`} icon={Users} color="text-white"
            sub={`LTV: $${data.revenue.ltv}`} />
          <MetricCard label="Churn" value={`${data.revenue.churn_rate}%`} icon={TrendingDown}
            color={data.revenue.churn_rate <= 3 ? "text-amber-400" : "text-red-400"}
            sub={`-$${data.revenue.churn_revenue}/mes`} />

          {/* BCV Rate */}
          <Card className="border-amber-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Landmark size={15} className="text-amber-400" />
              <span className="text-xs text-amber-400 font-semibold">Tasa BCV</span>
            </div>
            <p className="text-2xl font-bold text-white">Bs {data.bcv_rate.usd_to_bs}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${data.bcv_rate.source === "bcv" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="text-[10px] text-gray-500">
                {data.bcv_rate.source === "bcv" ? "Automática" : "Manual"} · {data.bcv_rate.date}
              </span>
            </div>
          </Card>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-3 gap-4">
          {/* Left 2 cols */}
          <div className="col-span-2 space-y-4">

            {/* Revenue Trend + Plan Distribution */}
            <div className="grid grid-cols-2 gap-4">
              {/* Monthly Trend */}
              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <BarChart3 size={16} /> Tendencia Mensual
                </h3>
                <div className="space-y-2">
                  {data.monthly_revenue.map((m) => {
                    const maxMrr = Math.max(...data.monthly_revenue.map(x => x.mrr));
                    return (
                      <div key={m.month}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-500 w-8">{m.month}</span>
                          <span className="text-white font-semibold">${m.mrr.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-4 bg-wuipi-bg rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-500/60 rounded-l-full" style={{ width: `${(m.collected / maxMrr) * 100}%` }} />
                          <div className="h-full bg-amber-500/60" style={{ width: `${(m.pending / maxMrr) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/60" /> Cobrado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/60" /> Pendiente</span>
                  </div>
                </div>
              </Card>

              {/* Plans */}
              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Users size={16} /> Distribución por Plan
                </h3>
                <div className="space-y-3">
                  {data.by_plan.map((p) => (
                    <div key={p.plan}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">{p.plan}</span>
                        <span className="text-white font-semibold">{p.clients} cl · ${p.mrr.toLocaleString()}</span>
                      </div>
                      <LoadBar value={p.percentage * (100 / Math.max(...data.by_plan.map(x => x.percentage)))} />
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Payment Methods + Taxes */}
            <div className="grid grid-cols-2 gap-4">
              {/* Payment Methods */}
              <Card>
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <CreditCard size={16} /> Métodos de Pago
                </h3>
                <div className="space-y-2.5">
                  {data.collections.by_method.map((m) => (
                    <div key={m.method} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-28 truncate">{m.label}</span>
                      <div className="flex-1 h-5 bg-wuipi-bg rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-cyan-500/50 rounded-full"
                          style={{ width: `${(m.amount_usd / maxMethodAmount) * 100}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/80">
                          ${m.amount_usd.toLocaleString()}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{m.count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Fiscal / Taxes */}
              <Card className="border-amber-500/10">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <Scale size={16} /> Fiscal SENIAT — {data.tax_summary.period}
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
                    <p className="text-[10px] text-gray-500 uppercase font-semibold mb-2">IVA (16%)</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Débito fiscal</span>
                        <p className="font-bold text-white">${data.tax_summary.iva_debito_fiscal.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Crédito fiscal</span>
                        <p className="font-bold text-emerald-400">${data.tax_summary.iva_credito_fiscal.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">IVA a pagar</span>
                        <p className="font-bold text-amber-400">${data.tax_summary.iva_to_pay.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Retenciones recib.</span>
                        <p className="font-bold text-cyan-400">${data.tax_summary.iva_retentions_received.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-wuipi-bg rounded-lg border border-wuipi-border text-center">
                      <p className="text-[10px] text-gray-500">ISLR Ret.</p>
                      <p className="text-sm font-bold text-white">${data.tax_summary.islr_retentions_made}</p>
                    </div>
                    <div className="p-2 bg-wuipi-bg rounded-lg border border-wuipi-border text-center">
                      <p className="text-[10px] text-gray-500">IGTF (3%)</p>
                      <p className="text-sm font-bold text-white">${data.tax_summary.igtf_collected}</p>
                    </div>
                    <div className="p-2 bg-wuipi-bg rounded-lg border border-wuipi-border text-center">
                      <p className="text-[10px] text-gray-500">Lib. Ventas</p>
                      <p className="text-sm font-bold text-white">{data.tax_summary.libro_ventas_count}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Recent Invoices */}
            <Card>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Receipt size={16} /> Últimas Facturas
              </h3>
              <div className="space-y-2">
                {data.recent_invoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </div>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Collection Score */}
            <Card className="flex flex-col items-center py-4">
              <ScoreRing score={Math.round(data.collections.collection_rate)} size={80} />
              <p className="text-sm font-semibold text-white mt-2">Cobranza</p>
              <p className="text-xs text-gray-500">Meta: 95%</p>
              <div className="w-full grid grid-cols-2 gap-2 mt-4">
                <div className="p-2 bg-wuipi-bg rounded-lg text-center">
                  <p className="text-[10px] text-gray-500">Cobrado</p>
                  <p className="text-sm font-bold text-emerald-400">${data.collections.total_collected_usd.toLocaleString()}</p>
                </div>
                <div className="p-2 bg-wuipi-bg rounded-lg text-center">
                  <p className="text-[10px] text-gray-500">Pendiente</p>
                  <p className="text-sm font-bold text-amber-400">${data.collections.total_pending_usd.toLocaleString()}</p>
                </div>
              </div>
            </Card>

            {/* Top Debtors */}
            <Card className="border-red-500/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400" /> Morosos
                </h3>
                <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full text-xs font-bold">
                  {data.total_debtors} total
                </span>
              </div>
              <div className="space-y-2">
                {data.top_debtors.map((d) => (
                  <DebtorRow key={d.client_id} debtor={d} />
                ))}
              </div>
              <div className="mt-3 p-2 bg-red-500/5 border border-red-500/15 rounded-lg">
                <p className="text-xs text-red-400 font-semibold">Total deuda vencida</p>
                <p className="text-lg font-bold text-red-400">${data.collections.total_overdue_usd.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500">Bs {(data.collections.total_overdue_usd * data.bcv_rate.usd_to_bs).toLocaleString()}</p>
              </div>
            </Card>

            {/* Refresh */}
            <Card>
              <button
                onClick={() => { setRefreshing(true); fetchData(); }}
                disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-xs font-semibold disabled:opacity-50"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Actualizando..." : "Refrescar datos"}
              </button>
              <p className="text-[10px] text-gray-600 text-center mt-2">Auto-refresh: 2 min</p>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
