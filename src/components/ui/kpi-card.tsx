"use client";

import { Card } from "@/components/ui/card";

const COLORS: Record<string, string> = {
  cyan: "text-cyan-400", emerald: "text-emerald-400", amber: "text-amber-400",
  red: "text-red-400", violet: "text-violet-400", blue: "text-blue-400", white: "text-white",
};
const ICON_BG: Record<string, string> = {
  cyan: "bg-cyan-500/10", emerald: "bg-emerald-500/10", amber: "bg-amber-500/10",
  red: "bg-red-500/10", violet: "bg-violet-500/10", blue: "bg-blue-500/10", white: "bg-gray-500/10",
};

export function KPICard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub?: string;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${ICON_BG[color] || ICON_BG.white} flex items-center justify-center`}>
          <Icon size={18} className={COLORS[color] || COLORS.white} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-xl font-bold ${COLORS[color] || COLORS.white}`}>{value}</p>
          {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}
