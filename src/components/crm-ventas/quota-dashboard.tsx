"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Trophy, Target, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface QuotaProgress {
  id: string;
  salesperson_id: string;
  month: string;
  target_count: number;
  target_amount: number;
  actual_count: number;
  actual_amount: number;
  pct_count: number;
  pct_amount: number;
  crm_salespeople: { id: string; full_name: string; type: string } | null;
}

const fmtUSD = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function getMonthStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonth(monthStr: string) {
  const d = new Date(monthStr + "T12:00:00");
  return d.toLocaleDateString("es-VE", { month: "long", year: "numeric" });
}

export default function QuotaDashboard() {
  const [month, setMonth] = useState(() => getMonthStr(new Date()));
  const [progress, setProgress] = useState<QuotaProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/crm-ventas/quotas/progress?month=${month}`)
      .then(r => r.json())
      .then(d => setProgress(Array.isArray(d) ? d : []))
      .catch(() => setProgress([]))
      .finally(() => setLoading(false));
  }, [month]);

  const prevMonth = () => {
    const d = new Date(month + "T12:00:00");
    d.setMonth(d.getMonth() - 1);
    setMonth(getMonthStr(d));
  };

  const nextMonth = () => {
    const d = new Date(month + "T12:00:00");
    d.setMonth(d.getMonth() + 1);
    setMonth(getMonthStr(d));
  };

  // Totals
  const totalTargetCount = progress.reduce((s, q) => s + q.target_count, 0);
  const totalActualCount = progress.reduce((s, q) => s + q.actual_count, 0);
  const totalTargetAmount = progress.reduce((s, q) => s + q.target_amount, 0);
  const totalActualAmount = progress.reduce((s, q) => s + q.actual_amount, 0);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Trophy size={16} /> Cuotas de Vendedores
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded text-gray-500 hover:text-white"><ChevronLeft size={16} /></button>
          <span className="text-xs font-semibold text-gray-300 min-w-[120px] text-center capitalize">{formatMonth(month)}</span>
          <button onClick={nextMonth} className="p-1 rounded text-gray-500 hover:text-white"><ChevronRight size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={16} className="animate-spin text-gray-500" />
        </div>
      ) : progress.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-6">No hay cuotas configuradas para este mes</p>
      ) : (
        <div className="space-y-3">
          {progress.map(q => (
            <div key={q.id} className="p-3 bg-wuipi-bg rounded-lg border border-wuipi-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white">{q.crm_salespeople?.full_name || "—"}</span>
                <span className="text-[10px] text-gray-500">{q.crm_salespeople?.type === "external" ? "Aliado" : "Interno"}</span>
              </div>
              {/* Count bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-gray-500 flex items-center gap-1"><Target size={10} /> Ventas</span>
                  <span className="text-gray-300">{q.actual_count} / {q.target_count} <span className={`font-bold ${q.pct_count >= 100 ? "text-emerald-400" : q.pct_count >= 50 ? "text-amber-400" : "text-red-400"}`}>({q.pct_count}%)</span></span>
                </div>
                <div className="h-1.5 bg-wuipi-card rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${q.pct_count >= 100 ? "bg-emerald-400" : q.pct_count >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min(100, q.pct_count)}%` }} />
                </div>
              </div>
              {/* Amount bar */}
              <div>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-gray-500">$ Monto</span>
                  <span className="text-gray-300">{fmtUSD(q.actual_amount)} / {fmtUSD(q.target_amount)} <span className={`font-bold ${q.pct_amount >= 100 ? "text-emerald-400" : q.pct_amount >= 50 ? "text-amber-400" : "text-red-400"}`}>({q.pct_amount}%)</span></span>
                </div>
                <div className="h-1.5 bg-wuipi-card rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${q.pct_amount >= 100 ? "bg-emerald-400" : q.pct_amount >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${Math.min(100, q.pct_amount)}%` }} />
                </div>
              </div>
            </div>
          ))}

          {/* Totals */}
          <div className="pt-2 border-t border-wuipi-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 font-semibold">Total equipo</span>
              <div className="flex items-center gap-4">
                <span className="text-white font-bold">{totalActualCount}/{totalTargetCount} ventas</span>
                <span className="text-emerald-400 font-bold">{fmtUSD(totalActualAmount)}/{fmtUSD(totalTargetAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
