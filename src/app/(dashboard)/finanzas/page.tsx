"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  DollarSign, TrendingUp, TrendingDown, RefreshCw, ArrowDown, ArrowUp,
  Receipt, Users, Wallet, BarChart3, PieChart, Calendar,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const fmtUSD = (n: number) =>
  `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtK = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmtUSD(n);

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "egresos", label: "Egresos" },
  { key: "proveedores", label: "Proveedores" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  "Costo del servicio": "#F46800",
  "Nómina y RRHH": "#8B5CF6",
  "Gastos operativos": "#06B6D4",
  "Administración": "#EAB308",
  "Gastos financieros": "#EF4444",
  "Depreciación": "#6B7280",
  "Otros": "#9CA3AF",
};

type TabKey = typeof TABS[number]["key"];

// ── Period presets ──────────────────────────────────────────

function getPresets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const startOfMonth = (yr: number, mo: number) => new Date(yr, mo, 1);
  const endOfMonth = (yr: number, mo: number) => new Date(yr, mo + 1, 1);

  const ML: Record<number, string> = {
    0: "Ene", 1: "Feb", 2: "Mar", 3: "Abr", 4: "May", 5: "Jun",
    6: "Jul", 7: "Ago", 8: "Sep", 9: "Oct", 10: "Nov", 11: "Dic",
  };

  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;

  return [
    { key: "este-mes", label: `${ML[m]} ${y}`, from: fmt(startOfMonth(y, m)), to: fmt(endOfMonth(y, m)) },
    { key: "mes-anterior", label: `${ML[prevM]} ${prevY}`, from: fmt(startOfMonth(prevY, prevM)), to: fmt(endOfMonth(prevY, prevM)) },
    { key: "ultimos-3", label: "Últimos 3 meses", from: fmt(startOfMonth(m >= 2 ? y : y - 1, (m - 2 + 12) % 12)), to: fmt(endOfMonth(y, m)) },
    { key: "ultimos-6", label: "Últimos 6 meses", from: fmt(startOfMonth(m >= 5 ? y : y - 1, (m - 5 + 12) % 12)), to: fmt(endOfMonth(y, m)) },
    { key: "este-ano", label: `${y}`, from: `${y}-01-01`, to: `${y + 1}-01-01` },
    { key: "ano-anterior", label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y}-01-01` },
  ];
}

export default function FinanzasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) || "resumen";

  const presets = useMemo(() => getPresets(), []);
  const [periodKey, setPeriodKey] = useState("este-ano");

  const currentPreset = presets.find((p) => p.key === periodKey) || presets[4]; // default: este año

  const setTab = (tab: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/finanzas?${params.toString()}`);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["finanzas-summary", currentPreset.from, currentPreset.to],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: currentPreset.from,
        to: currentPreset.to,
        label: currentPreset.label,
      });
      const res = await fetch(`/api/finanzas/summary?${params}`);
      if (!res.ok) throw new Error("Error al cargar datos financieros");
      return res.json();
    },
    staleTime: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const pnl = data?.pnl;
  const expenses = data?.expenses;

  return (
    <>
      <TopBar
        title="Finanzas"
        subtitle={`Estado financiero — ${currentPreset.label}`}
        icon={<DollarSign size={22} />}
      />
      <div className="flex-1 overflow-auto">
        {/* Tabs + Period Filter */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-2 border-b border-wuipi-border flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? "bg-[#F46800]/10 text-[#F46800]"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <Calendar size={14} className="text-gray-500" />
            <select
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              className="appearance-none px-3 py-1.5 pr-7 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white focus:border-wuipi-accent/50 focus:outline-none"
            >
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-gray-500" />
            <span className="ml-3 text-gray-500 text-sm">Consultando Odoo...</span>
          </div>
        ) : !data ? (
          <div className="p-6">
            <Card className="text-center py-12">
              <DollarSign size={32} className="mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400 text-sm">No se pudieron cargar los datos financieros</p>
            </Card>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {activeTab === "resumen" && <ResumenTab pnl={pnl} expenses={expenses} data={data} />}
            {activeTab === "egresos" && <EgresosTab expenses={expenses} />}
            {activeTab === "proveedores" && <ProveedoresTab expenses={expenses} />}
          </div>
        )}
      </div>
    </>
  );
}

// ── Tab: Resumen (P&L) ─────────────────────────────────────

function ResumenTab({ pnl, expenses, data }: { pnl: any; expenses: any; data: any }) {
  const marginPositive = pnl?.net_margin_usd >= 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="MRR (Ingresos)"
          value={fmtUSD(pnl?.mrr_usd || 0)}
          icon={<TrendingUp size={16} />}
          color="text-emerald-400"
          sub="Mensual recurrente"
        />
        <KpiCard
          label="Egresos promedio/mes"
          value={fmtUSD(pnl?.avg_monthly_expense || 0)}
          icon={<TrendingDown size={16} />}
          color="text-red-400"
          sub={`${expenses?.line_count || 0} movimientos`}
        />
        <KpiCard
          label="Margen neto"
          value={fmtUSD(pnl?.net_margin_usd || 0)}
          icon={marginPositive ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          color={marginPositive ? "text-emerald-400" : "text-red-400"}
          sub={`${pnl?.margin_pct || 0}% del MRR`}
        />
        <KpiCard
          label="Tasa BCV"
          value={`Bs ${(data?.bcv_rate || 0).toFixed(2)}`}
          icon={<DollarSign size={16} />}
          color="text-cyan-400"
          sub="VED por 1 USD"
        />
      </div>

      {/* Expenses by Month Chart */}
      {expenses?.by_month?.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-wuipi-border">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <BarChart3 size={14} /> Egresos por mes (USD) — {expenses.period}
            </h3>
          </div>
          <div className="p-4 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenses.by_month}>
                <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtK(v)} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v: number) => [fmtUSD(v), "Egreso"]}
                />
                <Bar dataKey="total_usd" radius={[4, 4, 0, 0]} fill="#F46800" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Expenses by Category */}
      {expenses?.by_category?.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-wuipi-border">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <PieChart size={14} /> Distribución por categoría — {expenses.period}
            </h3>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {expenses.by_category.map((c: any) => (
                <div key={c.category} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[c.category] || "#6B7280" }}
                  />
                  <span className="text-sm text-gray-300 flex-1">{c.category}</span>
                  <span className="text-xs text-gray-500">{c.pct}%</span>
                  <span className="text-sm text-white font-medium w-24 text-right">{fmtUSD(c.total_usd)}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2 border-t border-wuipi-border/50">
                <div className="w-3 h-3 rounded-full shrink-0 bg-transparent" />
                <span className="text-sm text-white font-semibold flex-1">Total</span>
                <span className="text-xs text-gray-500">100%</span>
                <span className="text-sm text-white font-bold w-24 text-right">{fmtUSD(expenses.total_usd)}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Income History */}
      {data?.income?.monthly_history?.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-wuipi-border">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Wallet size={14} /> Cobranza vs Meta (últimos 6 meses)
            </h3>
          </div>
          <div className="p-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.income.monthly_history}>
                <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtK(v)} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v: number, name: string) => [fmtUSD(v), name === "drafted_usd" ? "Meta" : "Cobrado"]}
                />
                <Bar dataKey="drafted_usd" radius={[4, 4, 0, 0]} fill="#374151" name="Meta" />
                <Bar dataKey="collected_usd" radius={[4, 4, 0, 0]} fill="#10B981" name="Cobrado" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Egresos ────────────────────────────────────────────

function EgresosTab({ expenses }: { expenses: any }) {
  if (!expenses) return null;

  return (
    <div className="space-y-4">
      {/* Monthly table */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-wuipi-border">
          <h3 className="text-white font-semibold text-sm">Egresos por mes — {expenses.period}</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-3 font-medium">Mes</th>
                <th className="text-right p-3 font-medium">Movimientos</th>
                <th className="text-right p-3 font-medium">Total USD</th>
                <th className="text-right p-3 font-medium">Total VED</th>
              </tr>
            </thead>
            <tbody>
              {expenses.by_month.map((m: any) => (
                <tr key={m.month} className="border-b border-wuipi-border/50">
                  <td className="p-3 text-white">{m.label}</td>
                  <td className="p-3 text-right text-gray-400">{m.line_count}</td>
                  <td className="p-3 text-right text-red-400 font-medium">{fmtUSD(m.total_usd)}</td>
                  <td className="p-3 text-right text-gray-500 text-xs">
                    Bs {m.total_ved.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-wuipi-border bg-wuipi-card">
                <td className="p-3 text-white font-semibold">Total</td>
                <td className="p-3 text-right text-gray-400 font-medium">{expenses.line_count}</td>
                <td className="p-3 text-right text-red-400 font-bold">{fmtUSD(expenses.total_usd)}</td>
                <td className="p-3 text-right text-gray-500 text-xs">
                  Bs {expenses.total_ved.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Category table */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-wuipi-border">
          <h3 className="text-white font-semibold text-sm">Egresos por categoría — {expenses.period}</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-3 font-medium">Categoría</th>
                <th className="text-right p-3 font-medium">%</th>
                <th className="text-right p-3 font-medium">Total USD</th>
                <th className="text-right p-3 font-medium">Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {expenses.by_category.map((c: any) => (
                <tr key={c.category} className="border-b border-wuipi-border/50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[c.category] || "#6B7280" }}
                      />
                      <span className="text-white">{c.category}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right text-gray-400">{c.pct}%</td>
                  <td className="p-3 text-right text-red-400 font-medium">{fmtUSD(c.total_usd)}</td>
                  <td className="p-3 text-right text-gray-500">{c.line_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Monthly Bar Chart */}
      {expenses.by_month?.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-wuipi-border">
            <h3 className="text-white font-semibold text-sm">Tendencia mensual (USD)</h3>
          </div>
          <div className="p-4 h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenses.by_month}>
                <XAxis dataKey="label" tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtK(v)} />
                <Tooltip
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(v: number) => [fmtUSD(v), "Egreso"]}
                />
                <Bar dataKey="total_usd" radius={[4, 4, 0, 0]}>
                  {expenses.by_month.map((_: any, i: number) => (
                    <Cell key={i} fill={i === expenses.by_month.length - 1 ? "#F46800" : "#374151"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Proveedores ────────────────────────────────────────

function ProveedoresTab({ expenses }: { expenses: any }) {
  if (!expenses?.by_vendor?.length) {
    return (
      <Card className="text-center py-12">
        <Users size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-400 text-sm">No hay facturas de proveedor en el período</p>
      </Card>
    );
  }

  const maxUsd = expenses.by_vendor[0]?.total_usd || 1;

  return (
    <div className="space-y-4">
      <Card className="!p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-wuipi-border">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Receipt size={14} /> Top proveedores — {expenses.period}
          </h3>
          <p className="text-gray-500 text-xs mt-0.5">Basado en facturas de proveedor confirmadas</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                <th className="text-left p-3 font-medium">#</th>
                <th className="text-left p-3 font-medium">Proveedor</th>
                <th className="text-right p-3 font-medium">Facturas</th>
                <th className="text-right p-3 font-medium">Total USD</th>
                <th className="p-3 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.by_vendor.map((v: any, i: number) => (
                <tr key={v.vendor_id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors">
                  <td className="p-3 text-gray-600 text-xs">{i + 1}</td>
                  <td className="p-3">
                    <p className="text-white text-xs font-medium">{v.vendor_name}</p>
                    <p className="text-gray-600 text-[10px]">
                      Bs {v.total_ved.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </td>
                  <td className="p-3 text-right text-gray-400">{v.bill_count}</td>
                  <td className="p-3 text-right text-red-400 font-medium">{fmtUSD(v.total_usd)}</td>
                  <td className="p-3">
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className="bg-[#F46800] h-1.5 rounded-full"
                        style={{ width: `${(v.total_usd / maxUsd) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────

function KpiCard({ label, value, icon, color, sub }: {
  label: string; value: string; icon: React.ReactNode; color: string; sub: string;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>
    </Card>
  );
}
