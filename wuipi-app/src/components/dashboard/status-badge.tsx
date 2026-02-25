import { cn } from "@/lib/utils";

type Status = "operational" | "online" | "warning" | "degraded" | "critical" | "offline";

const statusConfig: Record<Status, { color: string; bg: string; label: string }> = {
  operational: { color: "text-emerald-400", bg: "bg-emerald-400/10", label: "Operativo" },
  online: { color: "text-emerald-400", bg: "bg-emerald-400/10", label: "En línea" },
  warning: { color: "text-amber-400", bg: "bg-amber-400/10", label: "Alerta" },
  degraded: { color: "text-amber-400", bg: "bg-amber-400/10", label: "Degradado" },
  critical: { color: "text-red-400", bg: "bg-red-400/10", label: "Crítico" },
  offline: { color: "text-red-400", bg: "bg-red-400/10", label: "Fuera de línea" },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.operational;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold",
        config.bg,
        config.color,
        className
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          status === "critical" || status === "offline" ? "animate-pulse" : "",
          config.color.replace("text-", "bg-")
        )}
      />
      {config.label}
    </span>
  );
}
