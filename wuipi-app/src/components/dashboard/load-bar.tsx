import { cn } from "@/lib/utils";

interface LoadBarProps {
  value: number;
  className?: string;
}

export function LoadBar({ value, className }: LoadBarProps) {
  const color =
    value >= 80 ? "bg-red-500" : value >= 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className={cn("w-full h-1.5 bg-wuipi-bg rounded-full overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
